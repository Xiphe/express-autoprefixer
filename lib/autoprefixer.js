var interceptor  = require('express-interceptor');
var autoprefixer = require('autoprefixer');
var postcss = require('postcss');

module.exports = function () {
    var args = Array.prototype.slice.call(arguments);

    return interceptor(function (req, res) {
        // Prevent If-None-Match revalidation with the downstream middleware with ETags that aren't suffixed with "-autoprefixer":
        var ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch) {
            var validIfNoneMatchTokens = ifNoneMatch.split(" ").filter(function (etag) {
                return (/-autoprefixer["-]$/).test(etag);
            });
            if (validIfNoneMatchTokens.length > 0) {
                // Give the upstream middleware a chance to reply 304:
                req.headers['if-none-match'] = validIfNoneMatchTokens.map(function (validIfNoneMatchToken) {
                    return validIfNoneMatchToken.replace(/-autoprefixer(["-])$/, '$1');
                }).join(" ");
            } else {
                delete req.headers['if-none-match'];
            }
        }
        delete req.headers['if-modified-since']; // Prevent false positive conditional GETs after enabling autoprefixer

        return {
            isInterceptable: function () {
                return /text\/css/.test(res.getHeader('Content-Type'));
            },
            intercept: function (body, send) {
                var contentType = res.getHeader('Content-Type');
                var matchContentType = contentType && contentType.match(/^text\/css(?:;\s*charset=([a-z0-9\-]+))?$/i);

                // The mime module doesn't support less yet, so we fall back:
                if (matchContentType) {
                    if (!body.length) {
                        send(res.statusCode);
                    }

                    postcss([autoprefixer.apply(null, args)])
                        .process(body)
                        .then(function (result) {
                            res.setHeader('Content-Type', 'text/css');
                            var upstreamETag = res.getHeader('ETag');
                            if (upstreamETag) {
                                res.setHeader('ETag', upstreamETag.replace(/"$/, '-autoprefixer"'));
                            }
                            res.setHeader('Content-Length', Buffer.byteLength(result.css));
                            send(result.css);
                        })
                        .catch(function (err) {
                            send(500, err);
                        });

                } else {
                    send(body);
                }
            }
        };
    });
};
