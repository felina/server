// JSDoc3 Plugin for documenting the API

// Define the custom tags we are implementing
exports.defineTags = function(dict) {
    dict.defineTag('hbcsapi', {
        'mustHaveValue': true,
        'canHaveType': true,
        'canHaveName': true,
        'onTagged': function(doclet, tag) {
            // Add leading slash in case it was forgotten.
            if (tag.value.name.charAt(0) !== '/') {
                tag.value.name = '/' + tag.value.name;
            }
            // Move this function definition to the APIDoc namespace.
            doclet.alias = "APIDoc." + tag.value.type.names[0] + " " + tag.value.name;
            // Prefix the function description with a note about the true identity of the function.
            doclet.description = "<code>This is an API endpoint. The underlying function takes Express " +
                "request and response objects. Parameters prefixed with a colon denote URL parameters. " +
                "They should replace the corresponding URL section as a URL encoded string.</code> " +
                "<br />" +
                "<br />" +
                doclet.description;
        }
    });
};
