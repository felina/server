/**
 * @module thumbnailer
 */

var fs = require('fs');
var gm = require('gm');

/**
 * @typedef Dimensions
 * @type {object}
 * @property {number} w - The width.
 * @property {number} h - The height.
 */

/**
 * Represents an image processor that creates thumbnails suitable for our frontends.
 * @constructor
 * @alias module:thumbnailer
 * @param {Dimensions} min_s - The minimum size of image accepted by the service.
 * @param {Dimensions} target_s - The maximum or ideal size of thumbnail to produce.
 * @param {string} in_dir - The directory to read input images from.
 * @param {string} out_dir - The directory to store converted thumbnails in.
 * @param {string} format - The image format to use for thumbnails.
 * @param {string} pfix - The string to prefix thumbnail filenames with.
 * @param {boolean} canvas - If true, output thumbnails should be a fixed size, with empty space whited out.
 */
function Thumbnailer(min_s, target_s, in_dir, out_dir, format, pfix, canvas) {
    // Check we're being called with new.
    if (!(this instanceof Thumbnailer)) {
        return new Thumbnailer(min_s, target_s, in_dir, out_dir, format, pfix, canvas);
    }

    // Validate size parameters
    if (!(min_s.w > 0 && min_s.h > 0)) {
        throw new Error("Invalid minimum size parameters.");
    }
    if (!(target_s.w > 0 && target_s.h > 0)) {
        throw new Error("Invalid thumb size parameters.");
    }
    // Create the output directory, if it doesn't already exist.
    try {
        fs.mkdirSync(out_dir);
    } catch (fsErr) {
        if (fsErr.code !== 'EEXIST') {
            // The directory couldn't be created.
            console.log(fsErr);
            throw fsErr;
        }
    }
    this.min_s = min_s;
    this.target_s = target_s;
    this.in_dir = in_dir;
    this.out_dir = out_dir;
    this.format = format;
    this.pfix = pfix;
    this.canvas = !!canvas;
}

/**
 * Lists the input formats to accept when verifying an image.
 */
Thumbnailer.prototype.VALID_TYPES = [
    'JPEG',
    'PNG',
    'BMP'
];

/**
 * Thumbnail creation callback.
 * @callback thumbnailCreationCallback
 * @param {Error} [err] - The error that occurred, if present.
 * @param {string} path - The full path to the output file.
 */

/**
 * Makes a thumbnail for an image, unless one already exists.
 * @param {string} src - The source image.
 * @param {thumbnailCreationCallback} callback - The callback that uses the newly created thumbnail.
 */
Thumbnailer.prototype.make = function(src, callback) {
    var infile = this.in_dir + '/' + src;
    var cmd = gm(infile)
        .resize(this.target_s.w, this.target_s.h, '>') // Only resize images greater than the size.
        .gravity('Center'); // Center the resized output
    
    if (this.canvas) {
        // Pad the output with a white background if the aspect ratio doesn't match.
        cmd = cmd.extent(this.target_s.w, this.target_s.h);
    }

    var outfile = this.out_dir + '/' + this.pfix + src;
    return cmd.write(outfile, function(err) {
        if (err) {
            console.log(err);
            return callback(err);
        } else {
            return callback(null, outfile);
        }
    });
};

/**
 * Generic boolean callback.
 * @callback boolCallback
 * @param {boolean} [bool] - The boolean outcome.
 */ 

/**
 * Verifies that an image is of the correct type and meets some minimum size requirements.
 * @param {string} src - The image to check.
 * @param {number} minDim - The minimum width or height of an image to accept.
 * @param {boolCallback} callback - The callback that handles the image validity.
 */
Thumbnailer.prototype.verify = function(src, callback) {
    var infile = this.in_dir + '/' + src;
    var min_s = this.min_s;
    var types = this.VALID_TYPES;
    return gm(infile).identify('%w\t%h\t%m', function (err, data) {
        if (err) {
            console.log(err);
            // If an error has occurred, this is almost certainly not an image.
            return callback(false);
        } else {
            // Split the data.
            var meta = data.split('\t');
            var w = meta[0];
            var h = meta[1];
            var format = meta[2];
            var valid =
                w > min_s.w &&
                h > min_s.h &&
                types.indexOf(format) >= 0;

            return callback(valid);
        }
    });
};

// Export the constructor as the module.
module.exports = Thumbnailer;
