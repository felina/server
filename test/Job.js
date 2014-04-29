var should = require('should');
var Job = require('../src/models/Job.js');

describe('Job', function() {
    it ('should set id to false when parameters are invalid', function() {
        (new Job(42, 1, 'job.exe', 'apoly', [{"a":{"bucket":"some.bucket","id":"0deae28a26727ebe30ecf2896e5862f1"},"b":{"bucket":"some.bucket","id":"0deae28a26727ebe30ecf2896e5862f2"}}])).should.have.property('id', 42);
        (new Job('abc', 1, 'job.exe', 'apoly', [{"a":{"bucket":"some.bucket","id":"0deae28a26727ebe30ecf2896e5862f1"},"b":{"bucket":"some.bucket","id":"0deae28a26727ebe30ecf2896e5862f1"}}])).should.have.property('id', false);
        (new Job(42, 'abc', 'job.exe', 'apoly', [{"a":{"bucket":"some.bucket","id":"0deae28a26727ebe30ecf2896e5862f1"},"b":{"bucket":"some.bucket","id":"0deae28a26727ebe30ecf2896e5862f1"}}])).should.have.property('id', false);
        (new Job(42, 1, null, 'apoly', [{"a":{"bucket":"some.bucket","id":"0deae28a26727ebe30ecf2896e5862f1"},"b":{"bucket":"some.bucket","id":"0deae28a26727ebe30ecf2896e5862f1"}}])).should.have.property('id', false);
    });
});
