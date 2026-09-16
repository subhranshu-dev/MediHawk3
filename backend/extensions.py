"""
Flask extension instances created here to avoid circular imports.
Extensions are initialized with the app in create_app().
"""
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

db = SQLAlchemy()
cors = CORS()
