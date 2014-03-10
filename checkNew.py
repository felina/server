from time import strftime, sleep
import urllib2
import json
import os
#
#timeStore = strftime("%Y-%m-%dT%H:%M:%S")
#
while True:
    try:
        print "Checking for commits at " + strftime("%Y-%m-%dT%H:%M:%S")
        #urlContents = urllib2.urlopen('https://api.github.com/repos/felina/server/commits?since=' + timeStore)
        urlContents = urllib2.urlopen('https://api.github.com/repos/felina/server/commits')
    except Exception, e:
        pass
    else:
        try:
            print "Loading URL contents"
            result = json.load(urlContents)
        except Exception, e:
            pass
        else:
            currHash = os.popen('git rev-parse HEAD').read()[:-1]
            if currHash is not result[0]['sha']:
                # new pull stuff
                print 'New commits! ' + result[0]['sha'] + ' vs curr ' + currHash
                os.system('git stash && git pull')
                pass
                
#timeStore = strftime("%Y-%m-%dT%H:%M:%S")
    sleep(60)

