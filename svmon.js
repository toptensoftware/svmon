#!/usr/bin/env node

let fetch = require('node-fetch');
let watchRecursive = require('./watchRecursive');
let { program } = require('commander');

program
    .description("Watches a directory for changes and posts change notifications to a souvenir server")
    .argument("<directory>")
    .option("--minPeriod <minPeriodSecs>", "minimum coalescing period (default=60)", 60)
    .option("--maxPeriod <minPeriodSecs>", "maximum coalescing period (default=600)", 600)
    .option("--post <endPoint>", "URL of the souvenir server to post to")
    .option("--prefix <prefix>", "a prefix to prepend to each file name") 
    .option("--plainText", "send body as plain text file list instead of JSON")
    .option("--withEvent", "include the event type in plain text format ('delete', 'dir', 'file' at start of line)")
    .option("--logTime", "write to output the time of each event batch")
    .option("--logBody", "write to output the post body")
    .option("--logEvents", "write a list of events to output")
    .option("--logResponse", "log response to the http post")
    .action(function(directory, options) {

        if (!options.prefix)
            options.prefix = "";


        watchRecursive(directory, {
            minPeriod: (parseInt(options.minPeriod) || 60) * 1000,
            maxPeriod: (parseInt(options.maxPeriod) || 600) * 1000,
        }, async function(ops) {

            // Fix up things
            for (let op of ops)
            {
                // Apply prefix and convert to forward slashes
                op.filename = options.prefix + op.filename.replace(/\\/g, '/');

                // More clearly mark directories by append '/'
                if (op.event == 'dir')
                    op.filename += '/';
            }

            if (options.logTime)
                console.log(`# ${new Date().toISOString()} [${ops.length}]`);

            // Show changes
            if (options.logEvents)
            {
                for (let op of ops)
                {
                    console.log(op.event, op.filename);
                }
                console.log();
            }            

            // Work out body/content type
            let body;
            let contentType;
            if (options.plainText)
            {
                body = ops.map(function(x) { 
                    if (options.withEvent)
                        return x.event + ' ' + x.filename;
                    else
                        return x.filename 
                }).join('\n');
                contentType = 'text/plain'; 
            }
            else
            {
                body = JSON.stringify(ops);
                contentType = 'application/json';
            }

            if (options.logBody)
                console.log(body);

            if (options.post)
            {
                try
                {
                    const response = await fetch(options.post, {
                        method: 'post',
                        headers: { 'Content-Type': contentType },
                        body: body
                    });
                    const responseText = await response.text();
                    if (options.logResponse)
                        console.log(`# ${response.status} - ${responseText}`);
                    if (response.status >= 400)
                        console.error(`Failed to post, server responded with ${response.status} - ${responseText}`);
                }
                catch (err)
                {
                    console.error("Failed to post:", err.message);
                }
            }

            if (options.logBody)
                console.log();
        });

    });


// Run it...
program.parse();
