# SVMON

`svmon` is a simple command line utility that watches a directory for changes and
posts notifications to a HTTP server.

## Usage

```
Usage: svmon [options] <directory>

Watches a directory for changes and posts change notifications to a HTTP server

Options:
  --minPeriod <minPeriodSecs>  minimum coalescing period (default=60) (default: 60)
  --maxPeriod <minPeriodSecs>  maximum coalescing period (default=600) (default: 600)
  --include <spec...>          files to include (default = all)
  --exclude <spec...>          files to exclude (default = none)
  --includeMime <mimeType...>  files to include by MIME type
  --excludeMime <mimeType...>  files to exclude by MIME type
    --post <endPoint>          URL of the HTTP endpoint to post to
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

Each generated event consists of an event type and a filename.

The event types are:

* `delete` - a file or directory was deleted
* `change` - a file or directory was added or changed

If a directory is added or deleted, events for all its sub-directories and contained
files are not generated.

All file and directory names are normalized to forward slash format.

If the filename ends with a forward slash it indicates the event applies to a directory,
otherwise it's a file.

Filenames are relative to the base directory with no preceding `./` or `/`.

Since the mount point of the watched directory on the machine where `svmon` is running
may not match the mount point on the machine being posted to, the posted filenames can
be qualified with the `--prefix` option.  This simply prepends all filenames with the supplied
string.  Don't forget to include a trailing '/' in the prefix argument - `svmon` won't
automatically add this for you.

## Coalescing Periods

Events are generated in batches according to the coalescing periods set by the
`--minPeriod` and `--maxPeriod` options (in seconds).

File operations that run longer than the max coalescing period may result in 
multiple notifications for the same file being posted.

## Match Filtering

The set of files and directories monitored can be filtered using the `--include` and
`--exclude` options.  The pattern syntax is that of [minimatch](https://www.npmjs.com/package/minimatch) with default options.

You can also filter on a file's MIME type or type/subtype.

eg:

* all *.JPEG, *.jpg etc... images: `--includeMime image/jpeg`
* all images: `--includeMime image`

For a path to be matched it must match at least one `--include` or `--includeMime` 
filter and not match any `--exclude` or `--excludeMime` filters.

## HTTP Posting

If the `--post` option is used, changes are posted to the supplied URL endpoint.

The posted data can be in one of three formats:

* `--plainText` - a plain list of files/directories 
* `--plainText --withEvents` - a list of files where each line is prepended with the 
  event type
* otherwise JSON in format `[ { event: "", filename: "" }, ... ]`
