"""Create the first super administrator and email them an invitation link.

python -m scripts.create_superuser --email you@example.com --first-name Ada --last-name Lovelace
"""

import argparse
import sys

from sqlalchemy import select

from app.core.db import SessionLocal
from app.modules.identity import service as identity
from app.modules.identity.models import Role, User
from app.modules.identity.rbac import seed_rbac


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--first-name", required=True)
    parser.add_argument("--last-name", required=True)
    parser.add_argument("--locale", default="en", choices=["en", "fr-CA", "es-419"])
    args = parser.parse_args()
    email = identity.normalize_email(args.email)
    with SessionLocal() as db:
        seed_rbac(db)
        if db.scalar(select(User).where(User.email == email)) is not None:
            sys.exit("A user with this email already exists.")
        user = User(
            email=email, password_hash=identity.unusable_password_hash(), first_name=args.first_name,
            last_name=args.last_name, country="CA", locale=args.locale, is_staff=True,
        )  # fmt: skip
        user.roles = [db.scalar(select(Role).where(Role.code == "super_admin"))]
        db.add(user)
        db.flush()
        identity.invite_staff(db, user)
        db.commit()
    print(f"Created {email}. An invitation email has been queued; the worker will send it.")


if __name__ == "__main__":
    main()
