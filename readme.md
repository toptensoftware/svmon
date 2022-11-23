# SVMON

`svmon` is a simple command line utility that watches a directory for changes and
posts notifications to a HTTP server.

## Usage

```
Usage: svmon [options] <directory>

Watches a directory for changes and posts change notifications to a souvenir server

Options:
  --minPeriod <minPeriodSecs>  minimum coalescing period (default=60) (default: 60)
  --maxPeriod <minPeriodSecs>  maximum coalescing period (default=600) (default: 600)
  --include <spec...>          files to include (default = all)
  --exclude <spec...>          files to exclude (default = none)
  --includeMime <mimeType...>  files to include by MIME type
  --excludeMime <mimeType...>  files to exclude by MIME type
  --post <endPoint>            URL of the souvenir server to post to
  --prefix <prefix>            a prefix to prepend to each file name
  --plainText                  send body as plain text file list instead of JSON
  --withEvent                  include the event type in plain text format ('delete' or 'change' 
                                at start of line)
  --logTime                    write to output the time of each event batch
  --logBody                    write to output the post body
  --logEvents                  write a list of events to output
  --logResponse                log response to the http post
  --verbose                    logs raw file change notifications
  -h, --help                   display help for command
```

## Events

Multiple file change notifications are coalesced into an event type
and a filename.

The event types are:

* `delete` - a file or directory was deleted (can't tell which)
* `file` - a file was added or changed
* `dir` - a directory was added or changed

If a directory is added or deleted, events for all its sub-directories and contained
files are not generated.

All file and directory names are normalized to forward slash format.  The file name
for `dir` events is always suffixed with a '/'.  A 'delete

## Coalescing Periods

Events are coalesced according to a min and max coalescing period. File operations
that run longer than the max coalescing period may result in multiple notifications
being posted.


## HTTP Posting

If the `--post` option is used, changes are posted to the supplied URL endpoint.

The posted data can be in one of three formats:

* `--plainText` - a plain list of files/directories 
* `--plainText --withEvents` - a list of files where each line is prepended with the 
  event type
* otherwise JSON in format `[ { event: "", filename: "" }, ... ]`