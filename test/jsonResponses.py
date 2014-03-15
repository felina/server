

class JsonResponses:

    @staticmethod
    def server(self):
        return {
            "res": true,
            "version": "0.1.0"
            }

    @staticmethod
    def non_existing_user(self):
        return {
            "res": false,
            "err": "No user"
            }

    @staticmethod
    def register_user(self):
        return {
            "res": true,
            "user": {
                "id": 1,
                "name": "testtest",
                "email": "test@gmail.com",
                "privilege": 1,
                "profile_image": "http://www.gravatar.com/avatar/undefined"
                }
            }

    @staticmethod
    def login_check(self):
        return {
            "res": true,
            "user": {
                "id": 1,
                "name": "testtest",
                "email": "test@gmail.com",
                "privilege": 1,
                "profile_image": "http://nl.ks07.co.uk:5000/user.png"
                }
            }

    @staticmethod
    def logout_login(self):
        return {
            "res": false,
            "err": {
                "code": 1,
                "msg": "You must be logged in to access this feature."
                }
            }

    @staticmethod
    def login(self):
        return {
            "res": true,
            "user": {
                "id": 1,
                "name": "testtest",
                "email": "test@gmail.com",
                "privilege": 1,
                "profile_image": "http://nl.ks07.co.uk:5000/user.png"
                }
            }
    
    @staticmethod
    def existing_register(self):
        return {
            "res": false,
            "err": {
                "code": 2,
                "msg": "Registration failed."
                }
            }

    @staticmethod
    def upload_image(self):
        return {
            "res": true,
            "images": []
            }












