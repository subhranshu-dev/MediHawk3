"""
Development seed data for MediHawk backend.

Run:
    python database.py --seed

Seed data mirrors the frontend mockData.ts for consistency during development.
All passwords are development defaults — CHANGE BEFORE ANY PRODUCTION USE.
Clearly labelled as development/simulation data.

Default credentials (development only):
  Admin:  arjun.patel@medihawk.in  / MediHawk@Admin2026
  Doctor: priya.mohanty@medihawk.in / MediHawk@Doctor2026
          (also accepts phone: 9861234567)
  Doctor: ravi.kumar@medihawk.in / MediHawk@Doctor2026B
          (also accepts phone: 9876543210)
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# ── Seed data (mirrors mockData.ts) ──────────────────────────────────────────

_LOCATIONS = [
    {
        'id': 'hub-01',
        'name': 'MediHawk Central Hub',
        'type': 'hub',
        'district': 'Bhubaneswar',
        'lat': 20.2961,
        'lng': 85.8189,
        'contact': '+91-674-2300000',
        'address': 'Rasulgarh, Bhubaneswar, Odisha 751010',
        'is_active': True,
    },
    {
        'id': 'phc-chandaka',
        'name': 'PHC Chandaka',
        'type': 'phc',
        'district': 'Khordha',
        'lat': 20.3512,
        'lng': 85.7612,
        'contact': '+91-674-2300001',
        'address': 'Chandaka, Bhubaneswar, Odisha 751024',
        'doctor_id': 'doc-001',
        'is_active': True,
    },
    {
        'id': 'phc-jatani',
        'name': 'PHC Jatani',
        'type': 'phc',
        'district': 'Khordha',
        'lat': 20.1682,
        'lng': 85.8141,
        'contact': '+91-674-2300002',
        'address': 'Jatani, Odisha 752050',
        'is_active': True,
    },
    {
        'id': 'chc-bhubaneswar',
        'name': 'CHC Bhubaneswar South',
        'type': 'chc',
        'district': 'Khordha',
        'lat': 20.2513,
        'lng': 85.8388,
        'contact': '+91-674-2300003',
        'address': 'Bhubaneswar South, Odisha 751001',
        'is_active': True,
    },
]

_INVENTORY = [
    {'id': 'inv-001', 'medicine': 'Oxytocin', 'quantity': 42, 'unit': 'vials',
     'temperature_required': '2-8°C', 'expiry_date': '2026-08-15', 'status': 'low_stock',
     'category': 'Maternal Health', 'min_threshold': 10, 'is_active': True},
    {'id': 'inv-002', 'medicine': 'Snakebite Antivenin', 'quantity': 28, 'unit': 'vials',
     'temperature_required': '2-8°C', 'expiry_date': '2026-11-30', 'status': 'in_stock',
     'category': 'Emergency', 'min_threshold': 8, 'is_active': True},
    {'id': 'inv-003', 'medicine': 'Hepatitis B Vaccine', 'quantity': 156, 'unit': 'doses',
     'temperature_required': '2-8°C', 'expiry_date': '2026-12-31', 'status': 'in_stock',
     'category': 'Vaccines', 'min_threshold': 20, 'is_active': True},
    {'id': 'inv-004', 'medicine': 'Magnesium Sulfate', 'quantity': 84, 'unit': 'vials',
     'temperature_required': '<25°C', 'expiry_date': '2026-10-15', 'status': 'in_stock',
     'category': 'Maternal Health', 'min_threshold': 15, 'is_active': True},
    {'id': 'inv-005', 'medicine': 'Oral Rehydration Salt', 'quantity': 200, 'unit': 'packs',
     'temperature_required': '<30°C', 'expiry_date': '2026-06-30', 'status': 'expiring',
     'category': 'General Emergency', 'min_threshold': 25, 'is_active': True},
    {'id': 'inv-006', 'medicine': 'Pentavalent Vaccine', 'quantity': 89, 'unit': 'doses',
     'temperature_required': '2-8°C', 'expiry_date': '2026-09-30', 'status': 'in_stock',
     'category': 'Vaccines', 'min_threshold': 20, 'is_active': True},
    {'id': 'inv-007', 'medicine': 'Anti-D Immunoglobulin', 'quantity': 12, 'unit': 'vials',
     'temperature_required': '2-8°C', 'expiry_date': '2026-07-31', 'status': 'critical',
     'category': 'Blood/Supply', 'min_threshold': 5, 'is_active': True},
    {'id': 'inv-008', 'medicine': 'Lignocaine HCL', 'quantity': 45, 'unit': 'ampoules',
     'temperature_required': '<25°C', 'expiry_date': '2026-12-31', 'status': 'in_stock',
     'category': 'Emergency', 'min_threshold': 10, 'is_active': True},
]

_DRONES = [
    {'id': 'MH-D01', 'name': 'Hawk Alpha', 'status': 'available',
     'lat': 20.2961, 'lng': 85.8189, 'battery': 100.0, 'total_missions': 187, 'flight_hours': 312.0},
    {'id': 'MH-D02', 'name': 'Hawk Beta', 'status': 'available',
     'lat': 20.2961, 'lng': 85.8189, 'battery': 96.0, 'total_missions': 143, 'flight_hours': 241.0},
    {'id': 'MH-D03', 'name': 'Hawk Gamma', 'status': 'available',
     'lat': 20.2961, 'lng': 85.8189, 'battery': 88.0, 'total_missions': 98, 'flight_hours': 165.5},
    {'id': 'MH-D04', 'name': 'Hawk Delta', 'status': 'maintenance',
     'lat': 20.2961, 'lng': 85.8189, 'battery': 45.0, 'total_missions': 62, 'flight_hours': 103.0},
]


def run_seed(app=None) -> None:
    """
    Insert development seed data. Safe to call inside an existing app context
    or with an explicit app argument.
    """
    from extensions import db
    from models.location import Location
    from models.doctor import Doctor
    from models.admin import Admin
    from models.inventory import InventoryItem
    from models.drone import Drone
    from services.auth_service import hash_password

    def _seed_locations():
        for loc_data in _LOCATIONS:
            if not db.session.get(Location, loc_data["id"]):
                loc = Location(**loc_data)
                db.session.add(loc)
        db.session.commit()
        logger.info('Seeded %d locations.', len(_LOCATIONS))

    def _seed_admin():
        if not db.session.get(Admin, 'admin-001'):
            admin = Admin(
                id='admin-001',
                name='Arjun Patel',
                email='arjun.patel@medihawk.in',
                password_hash=hash_password('MediHawk@Admin2026'),
                is_active=True,
            )
            db.session.add(admin)
            db.session.commit()
            logger.info('Seeded admin user: arjun.patel@medihawk.in')

    def _seed_doctor():
        if not db.session.get(Doctor, 'doc-001'):
            doctor = Doctor(
                id='doc-001',
                name='Dr. Priya Mohanty',
                email='priya.mohanty@medihawk.in',
                phone='9861234567',
                phc_id='phc-chandaka',
                password_hash=hash_password('MediHawk@Doctor2026'),
                is_active=True,
                email_verified=True,
            )
            db.session.add(doctor)
            db.session.commit()
            logger.info('Seeded doctor user: priya.mohanty@medihawk.in')

        # Second doctor for multi-user isolation testing
        if not db.session.get(Doctor, 'doc-002'):
            doctor_b = Doctor(
                id='doc-002',
                name='Dr. Ravi Kumar',
                email='ravi.kumar@medihawk.in',
                phone='9876543210',
                phc_id='phc-jatani',
                password_hash=hash_password('MediHawk@Doctor2026B'),
                is_active=True,
                email_verified=True,
            )
            db.session.add(doctor_b)
            db.session.commit()
            logger.info('Seeded doctor user: ravi.kumar@medihawk.in')

    def _seed_inventory():
        for item_data in _INVENTORY:
            if not db.session.get(InventoryItem, item_data["id"]):
                db.session.add(InventoryItem(**item_data))
        db.session.commit()
        logger.info('Seeded %d inventory items.', len(_INVENTORY))

    def _seed_drones():
        for drone_data in _DRONES:
            if not db.session.get(Drone, drone_data["id"]):
                db.session.add(Drone(**drone_data))
        db.session.commit()
        logger.info('Seeded %d drones.', len(_DRONES))

    if app is not None:
        with app.app_context():
            _seed_locations()
            _seed_admin()
            _seed_doctor()
            _seed_inventory()
            _seed_drones()
    else:
        # Already in app context (called from within a with-app block)
        _seed_locations()
        _seed_admin()
        _seed_doctor()
        _seed_inventory()
        _seed_drones()
