from time import strftime, sleep
import urllib2
import json

timeStore = strftime("%Y-%m-%dT%H:%M:%S")

while True:
    try:
        print "Checking for commits since " + timeStore
        urlContents = urllib2.urlopen('https://api.github.com/repos/felina/server/commits?since=' + timeStore)
    except Exception, e:
        pass
    else:
        try:
            print "Loading URL contents"
            result = json.load(urlContents)
        except Exception, e:
            pass
        else:
            if len(result) > 0:
                # Do the server restart stuff
                print 'new commits'
                pass
    timeStore = strftime("%Y-%m-%dT%H:%M:%S")
    sleep(60)

