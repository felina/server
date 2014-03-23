import hashlib
import math 
import json

class JsonResponses:

    @staticmethod
    def server():
        return {
            "res": True,
            "version": "0.1.0"
            }

    @staticmethod
    def non_existing_user():
        return {
            "res": False,
            "err": "No user"
            }

    @staticmethod
    def register_user(data):
        return {
            "res": True,
            "user": {
                "id": 1,
                "name": data['name'],
                "email": data['email'],
                "privilege": 1,
                "profile_image": "http://www.gravatar.com/avatar/undefined"
                }
            }

    @staticmethod
    def login_check(data):
        return {
            "res": True,
            "user": {
                "id": 1,
                "name": data['name'],
                "email": data['email'],
                "privilege": 1,
                "profile_image": "http://nl.ks07.co.uk:5000/user.png"
                }
            }

    @staticmethod
    def logout_login():
        return {
            "res": False,
            "err": {
                "code": 1,
                "msg": "You must be logged in to access this feature."
                }
            }

    @staticmethod
    def login(data):
        return {
            "res": True,
            "user": {
                "id": 1,
                "name": data['name'],
                "email": data['email'],
                "privilege": 1,
                "profile_image": "http://nl.ks07.co.uk:5000/user.png"
                }
            }
    
    @staticmethod
    def existing_register():
        return {
            "res": False,
            "err": {
                "code": 2,
                "msg": "Registration failed."
                }
            }

    @staticmethod
    def images(*ims):
        return {
            "res": True,
            "ids": [JsonResponses.hash_image(im) for im in ims]
            }

    @staticmethod
    def existing_image(im):
        return {
              "res": False,
              "err": {
                "code": 2,
                "msg": "Image already exists: " + im
              }
            }

    @staticmethod
    def upload_image_no_project():
        return {
            "res": False,
            "err": {
                "code": 3,
                "msg": "Invalid project."
                }
            }

    @staticmethod
    def register_project(data):
        return {
            "res": True,
            "project": {
                "id": 1,
                "name": data['name'],
                "desc": data['desc'],
                "active": False
                }
            }

    @staticmethod
    def hash_image(image):
        f = open(image, 'rb').read()
        h = ''
        i = 0.0
        step = len(f) / 100.0
        while i < len(f):
            h += str(ord(f[int(math.floor(i))]))
            i += step
        m = hashlib.md5()
        m.update(h)
        # print h
        return m.hexdigest()


    @staticmethod
    def meta_example(*images):
        return json.dumps([
               {
                  "id": JsonResponses().hash_image(im),
                  "metadata":{
                     "title":"Pingu",
                     "datetime":"2014-02-27T21:32:16.667Z",
                     "location":{
                        "name":"Africa",
                        "coords":{
                           "lat":0.1,
                           "lng":0.2
                        }
                     }
                  },
                  "annotations":{
                     # [
                     "chest":{
                       "shapes": {
                           "type":"rect",
                           "pos":{
                               "x":123,
                               "y": 456
                             },
                           "size": {
                               "height": 321,
                               "width": 999
                             }
                        }
                      }
                     # ]
                    
                  }
               }
             for im in images])

    

    # @staticmethod
    # def meta_example(*images):
    #     return json.dumps([
    #           {
    #             "id": JsonResponses().hash_image(im),
    #             "datetime": "2014-02-14T03:39:13.000Z",
    #             "location": 
    #               {
    #                 "lat": 54.5,
    #                 "lon": 0.4
    #               },
    #             "private": 1,
    #             "annotations": [
    #               {
    #                 "region": [
    #                   { "x": 100, "y": 200 },
    #                   { "x": 150, "y": 240 }
    #                 ],
    #                 "tag": "I will be replaced soon, dont use me"
    #               }
    #             ]
    #           }
    #           for im in images])

    @staticmethod
    def meta_example(*images):
        return json.dumps([{
        'url': JsonResponses().hash_image(images[0]),
        'metadata': {
            'title': 'Elephant',
            'datetime': '2014-02-27T21:32:16.667Z',
            'location': {
                'name': 'Africa',
                'coords': {
                    'lat': 0.1,
                    'lng': 0.2
                }
            }
        },
        'annotations': {}
    }])

    @staticmethod
    def image_listing(*images):
        return {
              "res": True,
              "images": [
                {
                  "imageid": JsonResponses().hash_image(im),
                  "datetime": None,
                  "loc": None,
                  "private": 1
                }
              for im in images]
            }



















