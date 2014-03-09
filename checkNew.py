from time import strftime, sleep
import urllib2
import json


timeStore = strftime("%Y-%m-%dT%H:%M:%S")
while True:
	try:
	    urlContents = urllib2.urlopen('https://api.github.com/repos/felina/server/commits?since=' + timeStore))
    except Error:
        pass
    else:
        try:
            result = json.load(urlContents)
        except Error:
            pass
        else:
            if len(result) > 0:
                # Do the server restart stuff
    timeStore = strftime("%Y-%m-%dT%H:%M:%S")
    sleep(60)

