let path = require('path');
let mimedb = require('mime-db');

let extMap;
function buildExtMap()
{
    extMap = {};
    for (let mimetype in mimedb)
    {
        let exts = mimedb[mimetype].extensions;
        if (exts)
        {
            for (let e of exts)
            {
                extMap[e] = mimetype;
            }
        }
    }
}

// Returns a function that match mime type
// either exactly ("image/jpeg") or partially ("image")
function mimematch(matchMimeType, matchNoExt)
{
    if (!extMap)
        buildExtMap();

    let slashPos = matchMimeType.indexOf('/');
    if (slashPos < 0)
    {
        matchMimeType += '/';
        return function(filename)
        {
            let ext = path.extname(filename);
            if (ext.length > 1)
            {
                let mimeType = extMap[ext.substring(1).toLowerCase()];
                if (!mimeType)
                    return false;
                return mimeType.startsWith(matchMimeType);
            }
            return matchNoExt;
        }
    }
    else
    {
        return function(filename)
        {
            let ext = path.extname(filename);
            if (ext.length > 1)
            {
                let mimeType = extMap[ext.substring(1).toLowerCase()];
                if (!mimeType)
                    return false;
                return mimeType == matchMimeType;
            }
            return matchNoExt;
        }
    }
}


module.exports = mimematch;