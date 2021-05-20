#!/usr/bin/env node

import fs = require('fs');
import path = require('path');
import express = require('express');
import bodyParser = require('body-parser');
import cors = require('cors');
import { sseMiddleware } from 'express-sse-middleware';

import {
    AuthorKeypair,
    Doc,
    FormatValidatorEs4,
    IStorageAsync,
    IngestResult,
    StorageAsync,
    StorageDriverAsyncMemory,
    WorkspaceAddress,
} from 'stone-soup';

//================================================================================
// EARTHSTAR SETUP

let FORMAT = 'es.4';
let VALIDATOR = new FormatValidatorEs4();

let DEMO_WORKSPACE = '+gardening.pals';
let setUpDemoStorage = (storage : IStorageAsync) => {
    let keypair : AuthorKeypair = {
        address: "@bird.btr46n7ij6eq6hwnpvfcdakxqy3e6vz4e5vmw33ur7tjey5dkx6ea",
        secret: "bcrmyrih74d5mpvaco3tjrawgzebnmzyqdxvxnvg2hvnsfdj3izga"
    }
    let aboutPath = `/about/~${keypair.address}/displayName.txt`;
    storage.set(keypair, {
        format: FORMAT,
        path: aboutPath,
        content: 'Bird, the example author',
    });
}

//================================================================================
// VIEWS

// from https://stackoverflow.com/questions/40263803/native-javascript-or-es6-way-to-encode-and-decode-html-entities
// escape HTML-related characters
let safe = (str: string) =>
    str.replace(/[&<>'"]/g, (tag) => (({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    } as any)[tag]));

let wrapInHtmlHeaderAndFooter = (page: string): string => 
    `<!DOCTYPE html>
    <html>
    <head>
        <title>🌎⭐️🗃 Earthstar Pub (Stone Soup edition)</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
        <style>
            * { box-sizing: border-box; }
            html {
                line-height: 21px;
                font-size: 16px;
                font-family: sans-serif;
                color: #222;
                background: white;
                padding: 10px;
            }
            :root {
                --ratio: 1.5;
                --s-5: calc(var(--s-4) / var(--ratio));
                --s-4: calc(var(--s-3) / var(--ratio));
                --s-3: calc(var(--s-2) / var(--ratio));
                --s-2: calc(var(--s-1) / var(--ratio));
                --s-1: calc(var(--s0) / var(--ratio));
                --s0: 1rem;
                --s1: calc(var(--s0) * var(--ratio));
                --s2: calc(var(--s1) * var(--ratio));
                --s3: calc(var(--s2) * var(--ratio));
                --s4: calc(var(--s3) * var(--ratio));
                --s5: calc(var(--s4) * var(--ratio));
                --round: var(--s0);

                --cPath: #ffe2b8;
                --cContent: #c9fcb7;
                --cWorkspace: #c5e8ff;
                --cAuthor: #f6cdff;

                --cAccentDark: #5e4d76;
                --cAccentLight: #a4f;

                --cGray90: #e2e2e2;
                --cGrayShadow: #bbb;
                --cGrayTextOnWhite: #888;
                --cWhite: #fff;
                --cBlack: #222;
                --cYellow: #fef8bb;
            }
            .cPath { background: var(--cPath); }
            .cContent { background: var(--cContent); }
            .cWorkspace { background: var(--cWorkspace); }
            .cAuthor { background: var(--cAuthor); }
            a code {
                text-decoration: underline;
            }
            code {
                background: #eee;
                padding: 4px 7px;
                margin: 2px;
                border-radius: 3px;
                border: 1px solid #888;
                display: inline-block;
                word-break: break-all;
                font-size: 16px;
            }
            pre {
                background: #eee;
                padding: 4px 7px;
                margin: 2px;
                border-radius: 3px;
                border: 1px solid #888;
                word-break: break-all;
                white-space: pre-wrap;
            }
            .small {
                font-size: 80%;
            }
            .outlined {
                border: 2px solid #444;
            }
            .indent {
                margin-left: 50px;
            }
            button, input[type="submit"] {
                background: var(--cAccentDark);
                color: var(--cWhite);
                padding: var(--s-2) var(--s-1);
                border: none;
                border-radius: var(--round);
                line-height: 21px;
                font-size: 16px;
            }
            .verticalMiddle {
                vertical-align: middle;
            }
            .infoBox {
                display: inline-block;
                padding: 0px var(--s0);
                background: var(--cGray90);
                border: 2px solid var(--cGrayShadow);
                border-radius: var(--round);
            }
        </style>
    <body>
        ${page}
    </body>
    </html>`

let aboutBadge = (title: string | undefined, notes: string | undefined): string => {
    let titleElem = (title === undefined || title === '')
        ? ''
        : `<h2>${title}</h2>`;
    let notesElem = (notes === undefined || notes === '')
        ? ''
        : `<p>${notes}</p>`;
    if (titleElem + notesElem === '') { return ''; }
    return `
        <div class="infoBox verticalMiddle">
            ${titleElem}
            ${notesElem}
        </div>
    `;
}

let listOfWorkspaces = (workspaces: string[], discoverableWorkspaces: boolean, title: string | undefined, notes: string | undefined): string => {
    let workspaceSection = `
        <p>This is a pub server hosting <b>${workspaces.length}</b> unlisted workspaces.</p>
        <p>If you know the workspace address, you can manually craft an URL to visit it:</p>
        <p><code><a href="/workspace/+your.workspace">/workspace/+your.workspace</a></code></p>
    `;
    if (discoverableWorkspaces) {
        workspaceSection = `
            <p>This is a pub server hosting the following workspaces:</p>
            <ul>
            ${workspaces.length === 0 ? `
                <li><i>No workspaces yet.  Create one by syncing with this pub, or</i></li>
                    <form action="/demo-hack/create-demo-workspace" method="post">
                        <input type="submit" name="make-demo" value="Create a demo workspace" />
                    </form>
                </li>
            ` : ''}
            ${workspaces.map(ws =>
                `<li>📂 <a href="/workspace/${safe(ws)}"><code class="cWorkspace">${safe(ws)}</code></a></li>`
            ).join('\n')}
            </ul>
        `;
    }
    return wrapInHtmlHeaderAndFooter(
        `<div class="logoAndInfoBox">
            <img src="/static/img/earthstar-logo-only.png"
                class="verticalMiddle"
                alt="earthstar logo"
                width=127 height=129
                />
            ${aboutBadge(title, notes)}
        </div>
        <h1>🗃 Earthstar Pub</h1>
        <h3>Stone Soup edition</h3>
        ${workspaceSection}
        <hr/>
        ${apiDocs('+your.workspace')}
        <hr/>
        ${cliDocs('+your.workspace')}
        <hr/>
        <p><small><a href="https://github.com/earthstar-project/earthstar">Earthstar on Github</a></small></p>
        `
    );
}

let workspaceDetails = async (storage: IStorageAsync): Promise<string> =>
    wrapInHtmlHeaderAndFooter(
        `<p><a href="/">&larr; Home</a></p>
        <h2>📂 Workspace: <code class="cWorkspace">${safe(storage.workspace)}</code></h2>
        <p>
            <form action="/earthstar-api/v1/${safe(storage.workspace)}/delete" method="post">
                <input type="submit" name="upvote" value="Delete this workspace" /> (It will come back if clients sync it again.)
            </form>
        </p>
        <hr />
        ${await pathsAndContents(storage)}
        `
    );

let cliDocs = (workspaceAddress: WorkspaceAddress): string =>
    `<h2>Sync with command line</h2>
    <p>You can sync with this pub using <a href="https://github.com/cinnamon-bun/earthstar-cli">earthstar-cli</a>.</p>
    <p>First create a local database with the same workspace name:</p>
    <p><code>$ earthstar create-workspace localfile.sqlite +your.workspace</code></p>
    Then you can sync:
    <p><code>$ earthstar sync localfile.sqlite http://pub-url.com</code></p>
    `

let apiDocs = (workspace: string) =>
    `<h2>HTTP API</h2>
    <p>Replace <code>:workspace</code> with your actual workspace address, including its leading plus character.
    <ul>
        <li>GET  <a href="/earthstar-api/v1/${safe(workspace)}/paths"><code>/earthstar-api/v1/:workspace/paths</code></a> - list all paths</li>
        <li>GET  <a href="/earthstar-api/v1/${safe(workspace)}/documents"><code>/earthstar-api/v1/:workspace/documents</code></a> - list all documents (including history)</li>
        <li>POST <code>/earthstar-api/v1/:workspace/documents</code> - upload documents (supply as a JSON array)</li>
    </ul>`;

let pathsAndContents = async (storage: IStorageAsync): Promise<string> => {
    let docs = await storage.getAllDocs();
    let docSections: string[] = [];
    for (let doc of docs) {
        let historyDocs = await storage.getAllDocsAtPath(doc.path);
        docSections.push(
            `<div>📄 <code class="cPath">${safe(doc.path)}</code></div>
            <div><pre class="cContent indent">${safe(doc.content)}</pre></div>
            <details class="indent">
                <summary>...</summary>
                ${historyDocs.map((historyDoc, ii) => {
                    let outlineClass = ii === 0 ? 'outlined' : ''
                    return `<pre class="small ${outlineClass}">${JSON.stringify(historyDoc, null, 2)}</pre>`
                }).join('\n')}
            </details>
            <div>&nbsp;</div>
            `
        );
    }
    return `<h2>Paths and contents</h2>\n` + docSections.join('\n');
}

//================================================================================
// EXPRESS SERVER

export interface PubOpts {
    port: number,
    readonly: boolean,
    allowPushToNewWorkspaces: boolean,
    discoverableWorkspaces: boolean,
    storageType: 'sqlite' | 'memory',
    dataFolder?: string,  // only needed for sqlite
    logLevel?: number,  // 0 none, 1 basic, 2 verbose, 3 sensitive
    title?: string, // title of the pub, to show on the homepage
    notes?: string, // longer notes about the pub, to show on the homepage
};

let workspaceToFilename = (dataFolder: string, workspace: WorkspaceAddress) =>
    // removes '+'
    path.join(dataFolder || '.', workspace.slice(1) + '.sqlite');

let filenameToWorkspace = (filename: string) => {
    if (filename.endsWith('.sqlite')) {
        filename = filename.slice(0, -7);
    }
    return '+' + path.basename(filename);
}

export let makeExpressApp = (opts: PubOpts) => {
    // returns an Express app but does not start running it.

    let logBasic = (...args: any[]) => {
        if (opts.logLevel && opts.logLevel >= 1) { console.log(...args); }
    }
    let logVerbose = (...args: any[]) => {
        if (opts.logLevel && opts.logLevel >= 2) { console.log(...args); }
    }
    let logSensitive = (...args: any[]) => {
        if (opts.logLevel && opts.logLevel >= 3) { console.log(...args); }
    }

    // a structure to hold our Earthstar workspaces
    let workspaceToStorage: {[ws: string]: IStorageAsync} = {};

    // load existing files
    if (opts.storageType === 'sqlite' && opts.dataFolder !== undefined) {
        console.error('sqlite is not supported yet'); // TODO
        process.exit(1);
        /*
        logVerbose('loading existing sqlite files');
        let files = fs.readdirSync(opts.dataFolder).filter(f => f.endsWith('.sqlite'));
        for (let fn of files) {
            let workspace = filenameToWorkspace(fn);
            logSensitive('    loading', fn, 'as workspace', workspace);
            let storage = new StorageSqlite({
                mode: 'create-or-open',
                workspace: workspace,
                validators: VALIDATORS,
                filename: path.join(opts.dataFolder, fn),
            });
            workspaceToStorage[workspace] = storage;
            logVerbose('    loaded');
        }
        */
    }

    let obtainStorage = (workspace: string, createOnDemand: boolean, opts: PubOpts): IStorageAsync | undefined => {
        logSensitive('obtainStorage', workspace);
        let storage = workspaceToStorage[workspace];
        if (storage !== undefined) { return storage; }
        if (!createOnDemand) { return undefined; }

        // create workspace on demand
        if (opts.storageType === 'memory') {
            storage = new StorageAsync(
                workspace,
                VALIDATOR,
                new StorageDriverAsyncMemory(workspace)
            );
        } else if (opts.storageType === 'sqlite') {
            console.error('sqlite not supported yet');
            process.exit(1)
            /*
            try {
                // make sure workspace address is valid so we know it will be a safe filename
                let err = VALIDATORS[0]._checkWorkspaceIsValid(workspace);
                if (isErr(err)) {
                    console.error(err);
                    console.error(workspace);
                    return undefined;
                }
                // build filename
                let filename = workspaceToFilename(opts.dataFolder || '.', workspace);
                logSensitive('    sqlite filename:', filename);
                storage = new StorageSqlite({
                    mode: 'create-or-open',
                    workspace: workspace,
                    validators: VALIDATORS,
                    filename: filename,
                });
            } catch (err) {
                console.error('error creating sqlite file:');
                console.error(err);
                return undefined;
            }
            */
        }
        workspaceToStorage[workspace] = storage;
        return storage;
    } 

    // add the demo store
    let demoStorage = obtainStorage(DEMO_WORKSPACE, true, opts);
    if (demoStorage !== undefined) {
        setUpDemoStorage(demoStorage);
        workspaceToStorage[demoStorage.workspace] = demoStorage;
    }

    // make express app
    let app = express();
    app.use(cors());
    app.use(sseMiddleware);

    // This solves an error when uploaded JSON payload is larger than approx 100kb
    // (when syncing up lots of data at once)
    //      PayloadTooLargeError: request entity too large
    app.use(bodyParser.json({ limit: '10mb' }));

    let publicDir = path.join(__dirname, '../public/static' );
    app.use('/static', express.static(publicDir));

    //--------------------------------------------------
    // routes for humans

    app.get('/', (req, res) => {
        logVerbose('/');
        let workspaces = Object.keys(workspaceToStorage);
        workspaces.sort();
        res.send(listOfWorkspaces(workspaces, opts.discoverableWorkspaces, opts.title, opts.notes));
    });

    app.get('/workspace/:workspace', async (req, res) => {
        logVerbose('workspace view');
        let workspace = req.params.workspace;
        let storage = obtainStorage(workspace, false, opts);
        if (storage === undefined) { res.sendStatus(404); return; };
        res.send(await workspaceDetails(storage));
    });

    //--------------------------------------------------
    // API

    // list paths
    app.get('/earthstar-api/v1/:workspace/paths', async (req, res) => {
        logVerbose('giving paths');
        let workspace = req.params.workspace;
        let storage = obtainStorage(workspace, false, opts);
        if (storage === undefined) { res.sendStatus(404); return; };
        // TODO: once we have storage.paths implemented, use that
        let paths = (await storage.getLatestDocs()).map(doc => doc.path);
        paths = [...new Set<string>(paths)];
        paths.sort();
        res.json(paths);
    });

    // get all documents
    app.get('/earthstar-api/v1/:workspace/documents', async (req, res) => {
        logVerbose('giving documents');
        let workspace = req.params.workspace;
        let storage = obtainStorage(workspace, false, opts);
        if (storage === undefined) { res.sendStatus(404); return; };
        res.json(await storage.getAllDocs())
    });

    // ingest documents (uploaded from client)
    app.post('/earthstar-api/v1/:workspace/documents', express.json({type: '*/*'}), async (req, res) => {
        logVerbose('ingesting documents');
        if (opts.readonly) { res.sendStatus(403); return; }
        let workspace = req.params.workspace;
        let storage = obtainStorage(workspace, opts.allowPushToNewWorkspaces, opts);
        if (storage === undefined) { res.sendStatus(404); return; };
        let docs : Doc[] = req.body;
        if (!Array.isArray(docs)) { res.sendStatus(400); return; }
        let numIngested = 0;
        for (let doc of docs) {
            let { ingestResult, docIngested } = await storage.ingest(doc);
            if (ingestResult === IngestResult.AcceptedAndLatest || ingestResult === IngestResult.AcceptedButNotLatest) {
                numIngested += 1;
            }
        }
        res.json({
            numIngested: numIngested,
            numIgnored: docs.length - numIngested,  // ignored or failed validation check
            numTotal: docs.length,
        });
    });

    // quick hack to allow removing workspaces from the demo pub
    // (they will come back if you sync them again)
    app.post('/earthstar-api/v1/:workspace/delete', (req, res) => {
        logVerbose('deleting workspace');
        let workspace = req.params.workspace;
        //workspaceToStorage[workspace].close();  // TODO: there's no close() yet
        delete workspaceToStorage[workspace];
        res.redirect('/');
    });

    // quick hack to restore the demo workspace
    app.post('/demo-hack/create-demo-workspace', (req, res) => {
        logVerbose('creating demo workspace');
        let demoStorage = obtainStorage(DEMO_WORKSPACE, true, opts);
        if (demoStorage !== undefined) {
            setUpDemoStorage(demoStorage);
            workspaceToStorage[demoStorage.workspace] = demoStorage;
        }
        res.redirect('/');
    });

    // live stream from server to client
    /* TODO: rebuild this using followers
    app.get('/earthstar-api/v1/:workspace/stream', (req, res) => {
        // Create a stream of server-sent events for the new write events in a workspace.
        // Return a stream of all newly occurring documents (encoded as JSON).
        // Existing documents will not be included.
        // Also send a keepalive event occasionally, which is just the string 'KEEPALIVE'.
        // If the workspace doesn't exist, return 404 right away.
        //
        // The stream is not smart about who sent in documents; if you push documents
        // to a pub they will come right back to you in the stream.
        //
        // When a client is about to sync with the server, it should, in this order:
        // 1. If a stream is running, stop it
        // 2. Do a regular push
        // 3. Start this stream
        // 4. Do a regular pull
        //
        // This will ensure that
        // * the workspace exists before we start the stream
        // * the pull and stream together will get all documents without missing any
        // * the pushed documents aren't just echoed back immediately in the stream
        //
        // A client that wishes to upload (push) documents individually as they change
        // may just POST them to the regular push endpoint as they occur.
        // They will be echoed back in the stream which wastes bandwidth but won't
        // break anything.

        let workspace = req.params.workspace;
        let storage = workspaceToStorage[workspace];

        if (!storage) {
            console.log('stream: workspace does not exist: ' + workspace);
            res.sendStatus(404);
            return;
        }
        console.log('stream: subscribing to ' + workspace);

        let sse = res.sse();

        sse.send('KEEPALIVE');
        res.write(':\n\n');  // SSE comment
        let keepaliveInterval = setInterval(() => {
            console.log('stream: keepalive');
            res.write(':\n\n');  // SSE comment
            sse.send('KEEPALIVE');
        }, 28 * 1000);  // every 28 seconds

        let unsub = storage.onWrite.subscribe(e => {
            console.log('stream: event from ' + workspace);
            sse.send(JSON.stringify(e.document));
        });

        req.on('close', () => {
            console.log('stream: closing stream: ' + workspace);
            clearInterval(keepaliveInterval);
            unsub();
        });
    });
    */

    return app;
}

export let serve = (opts : PubOpts) => {
    // Make and start the Express server.
    console.log(opts);
    if (opts.storageType === 'sqlite') {
        if (opts.dataFolder === undefined) {
            console.error('sqlite mode requires dataFolder to be set');
            process.exit(-1);
        }
        if (!fs.existsSync(opts.dataFolder)) {
            console.error('sqlite mode requires dataFolder to already exist');
            process.exit(-1);
        }
    }
    let app = makeExpressApp(opts);
    app.listen(opts.port, () => console.log(`Listening on http://localhost:${opts.port}`));
}
