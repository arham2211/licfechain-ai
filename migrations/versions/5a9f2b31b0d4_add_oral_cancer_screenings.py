"""add_oral_cancer_screenings

Revision ID: 5a9f2b31b0d4
Revises: 89b2c60c71c7
Create Date: 2026-04-12 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "5a9f2b31b0d4"
down_revision = "89b2c60c71c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oral_cancer_screenings",
        sa.Column("screening_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("visit_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lab_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("image_path", sa.String(length=500), nullable=False),
        sa.Column("image_hash", sa.String(length=128), nullable=True),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("diagnosis_label", sa.String(length=200), nullable=False),
        sa.Column("progression_stage", sa.String(length=100), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["lab_id"], ["labs.lab_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.patient_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["report_id"], ["lab_reports.report_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["visit_id"], ["doctor_visits.visit_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("screening_id"),
    )
    op.create_index("ix_oral_cancer_screenings_patient_id", "oral_cancer_screenings", ["patient_id"], unique=False)
    op.create_index("ix_oral_cancer_screenings_visit_id", "oral_cancer_screenings", ["visit_id"], unique=False)
    op.create_index("ix_oral_cancer_screenings_report_id", "oral_cancer_screenings", ["report_id"], unique=False)
    op.create_index("ix_oral_cancer_screenings_lab_id", "oral_cancer_screenings", ["lab_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_oral_cancer_screenings_lab_id", table_name="oral_cancer_screenings")
    op.drop_index("ix_oral_cancer_screenings_report_id", table_name="oral_cancer_screenings")
    op.drop_index("ix_oral_cancer_screenings_visit_id", table_name="oral_cancer_screenings")
    op.drop_index("ix_oral_cancer_screenings_patient_id", table_name="oral_cancer_screenings")
    op.drop_table("oral_cancer_screenings")

