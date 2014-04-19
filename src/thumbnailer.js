/**
 * @module thumbnailer
 */

var fs = require('fs');
var gm = require('gm');

/**
 * Represents an image processor that creates thumbnails suitable for our frontends.
 * @constructor
 * @alias module:thumbnailer
 * @param {number} target_width - The maximum or ideal width of thumbnail to produce.
 * @param {number} target_height - The maximum or ideal width of thumbnail to produce.
 * @param {string} in_dir - The directory to read input images from.
 * @param {string} out_dir - The directory to store converted thumbnails in.
 * @param {string} format - The image format to use for thumbnails.
 * @param {string} pfix - The string to prefix thumbnail filenames with.
 * @param {boolean} canvas - If true, output thumbnails should be a fixed size, with empty space whited out.
 */
function Thumbnailer(target_width, target_height, in_dir, out_dir, format, pfix, canvas) {
    // Check we're being called with new.
    if (!(this instanceof Thumbnailer)) {
        return new Thumbnailer(target_width, target_height, in_dir, out_dir, format, pfix, canvas);
    }

    // Validate size parameters
    if (!(target_width > 0 && target_height > 0)) {
        throw new Error("Invalid size parameters.");
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
    this.target_width = target_width;
    this.target_height = target_height;
    this.in_dir = in_dir;
    this.out_dir = out_dir;
    this.format = format;
    this.pfix = pfix;
    this.canvas = !!canvas;
}

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
        .resize(this.target_width, this.target_height, '>') // Only resize images greater than the size.
        .gravity('Center'); // Center the resized output
    
    if (this.canvas) {
        // Pad the output with a white background if the aspect ratio doesn't match.
        cmd = cmd.extent(this.target_width, this.target_height);
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
}

// Export the constructor as the module.
module.exports = Thumbnailer;
