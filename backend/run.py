"""
Development server entry point.
For production use a proper WSGI server (gunicorn, uWSGI) instead.
"""
import os

from dotenv import load_dotenv

load_dotenv()

from app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = app.config.get('DEBUG', False)
    app.logger.info('Starting development server on http://0.0.0.0:%d', port)
    # threaded=True is required for Socket.IO in later phases
    app.run(host='0.0.0.0', port=port, debug=debug, threaded=True)
