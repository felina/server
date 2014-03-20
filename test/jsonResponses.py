import hashlib
import math 

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
    def images(ims):
        return {
            "res": True,
            "ids": [JsonResponses.hash_image(im) for im in ims] if isinstance(ims, list) else JsonResponses.hash_image(ims)
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
# LENGTHS:111431 - 111431

# 13767751881971221192493912517821720921719921234102162182235101074420765141244157
# 22441911116816913711912443192865018723296157153117231219351832271125213237237284
# 44902332101191511724617622620864211561401991561889113114715261802193517974128200
# 35320344230252982130

# step = 1114.31


# 137/67/75/188/197/122/119/249/3/9/125/178/217/209/217/199/21/234/10/216/21/82/235/
# 10/107/44/207/65/141/244/15/72/244/191/11/168/169/137/119/124/43/192/86/50/187/232/
# 96/157/153/117/231/219/35/183/22/71/125/213/237/237/2/84/44/90/233/210/119/151/172/46
# /176/226/208/64/211/56/140/199/156/188/91/131/147/15/26/180/219/35/179/74/128/200/3/
# 53/203/44/230/252/98/2/130/





