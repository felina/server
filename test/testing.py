#!/usr/bin/python

from mimetypes import guess_type
from requests_toolbelt import MultipartEncoder
import MySQLdb as mdb
import sys
import requests
import json
import os
import re
import atexit
import subprocess
import time
import fcntl
import jsonResponses

port = 5000
path = 'http://localhost:' + str(port)

login_path = '/login'
register_path = '/register'
login_check_path = '/logincheck'
logout_path = '/logout'
login_path = '/login'
images_path = '/images'
upload_image_path = '/img'
new_project_path = '/project/new'
meta_upload_path = '/upload/metadata'
image_listing_path = '/images'

test_config = json.loads(open('test/testConfig.json').read())
register_details = test_config['register_details']
project_details = test_config['project_details']
test_image1 = test_config['images']['test_image1']
test_image2 = test_config['images']['test_image2']

cookie = None
with open('config/db_settings.json', 'r') as db_settings_file:
    db_settings = json.loads(db_settings_file.read())
server_process = None
test_number = 1

jsr = jsonResponses.JsonResponses()



class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

    def disable(self):
        self.HEADER = ''
        self.OKBLUE = ''
        self.OKGREEN = ''
        self.WARNING = ''
        self.FAIL = ''
        self.ENDC = ''

def color_str(s, c):
    h = ''
    if c == 'red':
        h = bcolors.FAIL
    elif c == 'blue':
        h = bcolors.HEADER
    return h + s + bcolors.ENDC

def exit_handler():
    swap_configs()
    global server_process
    server_process.kill()

# 
def swap_configs():
    os.system('mv config/db_settings.json test/db_settings.json')
    os.system('mv test/db_settingsTest.json config/db_settings.json')
    os.system('mv test/db_settings.json test/db_settingsTest.json')

def exec_sql_file(cursor, sql_file):
    print "[INFO] Executing SQL script file: '%s'" % (sql_file)
    statement = ""

    def replace_all(text, dic):
        for i, j in dic.iteritems():
            text = text.replace(i, j)
        return text

    for line in open(sql_file):
        if re.match(r'--', line):  # ignore sql comment lines
            continue
        # statement = statement.replace('felina', 'felinaTest')
        if not re.search(r'[^-;]+;', line):  # keep appending lines that don't end in ';'
            statement = statement + line
        else:  # when you get a line ending in ';' then exec statement and reset for next statement
            statement = statement + line
            #print "\n\n[DEBUG] Executing SQL statement:\n%s" % (statement)
            statement = replace_all(statement, {'felina': 'felinaTest'})
            try:
                cursor.execute(statement)
            except Exception as e:
                print "\n[WARN] MySQLError during execute statement \n\tArgs: '%s'" % (str(e.args))

            statement = ""


# Remove old database if it exists and then load the
# test database. 
def clear_database():
    try:
        # os
        con = mdb.connect(db_settings['host'], 
                          db_settings['user'], 
                          db_settings['password'], 
                          local_infile = 1)
        cur = con.cursor()
        cur.execute("SELECT VERSION()")
        ver = cur.fetchone()
        print "Database version : %s " % ver
        cur.execute("SET sql_notes = 0;")
        cur.execute("DROP DATABASE IF EXISTS felinaTest;")
        # exec_sql_file(cur, 'test/createTestDB.sql')
        exec_sql_file(cur, 'tools/createDB.sql')

        cur.execute("USE felinaTest;")

    except mdb.Error, e:
        print "Error %d: %s" % (e.args[0],e.args[1])
        sys.exit(1)
        
    finally:       
        if con:    
            con.close()

def start_server():
    start = time.time()
    process = subprocess.Popen('node src/index.js', stdout=subprocess.PIPE, shell=True)
    output = ''
    for c in iter(lambda: process.stdout.read(1), ''):
        if time.time() - start > 10:
            print 'Server connection timed out'
            sys.exit(1)
        # sys.stdout.write(c)
        output += c
        if 'Listening on ' + str(port) in output:
            print '\nServer initialized'
            global server_process
            server_process = process
            break
            # return process

def server_up():
    print_test('Server up')
    r = requests.get(url=path)
    expected_status_code = 200
    if r.status_code != expected_status_code:
        pfail()
        print 'The server does not appear to be up'
        print 'Expected ' + expected_status_code + ' but got ' + r.status_code
        sys.exit(1)
    result_object = json.loads(r.text)
    if not result_object['res']:
        pfail()
        print 'Result object is malformed: ' + json.dumps(result_object)
        sys.exit(1)
    response_object_check(r, jsr.server())
    ppass()

def print_test(ttext):
    global test_number
    print 'Test ' + str(test_number) + ': ' + ttext + ' -',
    test_number += 1

def ppass():
    print color_str('Pass', 'blue')

def pfail():
    print color_str('Fail', 'red')

# param1 is the result of the api call
# param2 is the message to be displayed conditional on param3
# param3 is whether 'res' in the result should be true or false
def response_handle(r, message2, res_expected):
    try:
        res = json.loads(r.text)['res']
    except Exception, e:
        pfail()
        print 'Failed with message: ' + r.text
        raise e
    else:
        if res != res_expected:
            pfail()
            print message2 + r.text
            sys.exit(1)

def response_object_check(res, correct):
    # print json.loads(res.text), correct
    if json.loads(res.text) != correct:
        'Results unequal expected ' + str(correct) + ' got ' + str(json.loads(res.text))

def non_existing_user():
    print_test('Non existing user')
    fake_params = {'email' : 'fakeEmail@gmail.com', 'pass' : 'fakepass'}
    r = requests.post(url=path + login_path, data=fake_params)
    response_handle(r, 'Fake user apparently exists: ', False)
    response_object_check(r, jsr.non_existing_user())
    ppass()

def register_user():
    print_test('Register user')
    r = requests.post(url=path + register_path, data=register_details)
    response_handle(r, 'User registration failed with message: ', True)
    global cookie
    cookie = {'connect.sid': r.cookies['connect.sid']}
    response_object_check(r, jsr.register_user(register_details))
    ppass()

def login_check():
    print_test('Login check')
    r = requests.get(url=path + login_check_path, cookies=cookie)
    response_handle(r, 'User cookie did not persist after register', True)
    response_object_check(r, jsr.login_check(register_details))
    ppass()

def logout():
    print_test('Logout')
    r = requests.get(url=path + logout_path, cookies=cookie)
    response_handle(r, 'User did not logout: ', True)
    r = requests.get(url=path + login_check_path, cookies=cookie)
    response_handle(r, 'User logout did not revoke cookie: ', False)
    response_object_check(r, jsr.logout_login())
    ppass()

def login():
    print_test('Login')
    r = requests.post(url=path + login_path, data=register_details)
    response_handle(r, 'Login failed: ', True)
    global cookie
    cookie = {'connect.sid': r.cookies['connect.sid']}
    response_object_check(r, jsr.login(register_details))
    ppass()

def register_existing():
    print_test('Register existing user')
    r = requests.post(url=path + register_path, data=register_details)
    response_handle(r, 'Existing user registration failed with message: ', False)
    response_object_check(r, jsr.existing_register())
    ppass()

def upload_image_no_project():
    print_test('Upload image no project')
    m = MultipartEncoder(
        fields = {
            'filename_project': '1',
            'filename': ('filename', open(test_image1, 'rb'), guess_type(test_image1)[0])
        })
    r = requests.post(url=path + upload_image_path, data=m, headers={'Content-Type': m.content_type}, cookies=cookie)
    response_handle(r, 'Image upload with no project should have failed: ', False)
    response_object_check(r, jsr.upload_image_no_project())
    ppass()
    

def register_project():
    print_test('Register project')
    global project_details
    r = requests.post(url=path + new_project_path, data=project_details, cookies=cookie)
    response_handle(r, 'Project create failed: ', True)
    response_object_check(r, jsr.register_project(project_details))
    project_details['id'] = json.loads(r.text)['project']['id']
    ppass()

def request_images(path_, *images):
    tb_fields = {}
    for im in images:
        tb_fields[im + '_project'] = str(project_details['id'])
        tb_fields[im] = (im, open(im, 'rb'), guess_type(im)[0])

    m = MultipartEncoder (
        fields = tb_fields
    )
    return requests.post(url=path_, data=m, headers={'Content-Type': m.content_type}, cookies=cookie)


def upload_images():
    print_test('Upload images')
    r = request_images(path + upload_image_path, test_image1, test_image2)
    response_handle(r, 'Image upload with project should not res false: ', True)
    response_object_check(r, jsr.images(test_image1, test_image2))
    ppass()

def upload_existing_image():
    print_test('Upload existing image')
    r = request_images(path + upload_image_path, test_image1)
    response_handle(r, 'Image upload with project should not res true: ', False)
    response_object_check(r, jsr.existing_image(test_image1))
    ppass()

# def images_equal(im1, im2):
#     b = ''.join([str(ord(x)) for x in im1])
#     a = ''.join([str(ord(y)) for y in im2])
#     print len(a), len(b)
#     return a == b

# def retrieve_images():
#     print_test('Retrieve images')

#     r = requests.get(url=path + upload_image_path + '/' + jsr.hash_image(test_image1), cookies=cookie)
#     if images_equal(r.text, open(test_image1, 'rb').read()):
#         print 'Equal!'
#     else:
#         print 'Not equal!'

def meta_upload():
    print_test('Metadata upload')
    # print jsr.meta_example(test_image1)
    r = requests.post(url = path + meta_upload_path, data=jsr.meta_example(test_image1), cookies=cookie)
    print r.text
    response_handle(r, 'Meta upload should not res false', True)

    # r = requests.post(url = path + meta_upload_path, data=[
    #           {
    #             "id": jsr.hash_image(test_image1),
    #             "datetime": "2014-02-14T03:39:13.000Z"
    #             # ,
    #             # "location": 
    #             #   {
    #             #     "lat": 54.5,
    #             #     "lon": 0.4
    #             #   },
    #             # "private": 1,
    #             # "annotations": [
    #             #   {
    #             #     "region": [
    #             #       { "x": 100, "y": 200 },
    #             #       { "x": 150, "y": 240 }
    #             #     ],
    #             #     "tag": "I will be replaced soon, dont use me"
    #             #   }
    #             # ]
    #           }], cookies=cookie)

    print r.text

def image_listing():
    print_test('Image listing')

    r = requests.get(url=path + image_listing_path, cookies=cookie)
    # print r.text
    response_handle(r, 'Image listing should not res false', True)
    response_object_check(r, jsr.image_listing(test_image1, test_image2))
    ppass()

def test_name():
    print_test('Test name')
    r = requests.get(url=path + test_path, cookies=cookie) # plus other parameters
    response_handle(r, 'Explanation of error if res is not what is expected', True) # Bool is expected res value
    response_object_check(r, jsr.test_name(test_params)) # Compare the response object to the expected response object
    ppass()

def main():
    swap_configs() 
    clear_database()
    start_server()

    print 'Testing server at path ' + path
    server_up()
    non_existing_user()
    register_user()
    login_check()
    logout()
    login()
    login_check()
    register_existing()
    upload_image_no_project()
    register_project()
    upload_images()
    upload_existing_image()
    # retrieve_images()
    meta_upload() # not working
    image_listing()

    # r = requests.get(url = path + '/projects', cookies=cookie)
    # print r.text
    
    ## Printing server output, warning: never ends, have to ctrl-C
    # line = ''
    # for c in iter(lambda: server_process.stdout.read(1), ''):
    #             line += c
    #             if c == '\n':
    #                 print line
    #                 line = ''
                    # break
    # post /project
    #     name, desc



if __name__ == '__main__':
    atexit.register(exit_handler)
    main()

