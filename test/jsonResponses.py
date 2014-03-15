

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
    def images():
        return {
            "res": True,
            "images": []
            }












