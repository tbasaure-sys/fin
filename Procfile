web: gunicorn 'meta_alpha_allocator.dashboard.wsgi:create_app()' --workers 1 --threads 4 --timeout 120 --bind 0.0.0.0:${PORT:-8000} --preload --log-level info
