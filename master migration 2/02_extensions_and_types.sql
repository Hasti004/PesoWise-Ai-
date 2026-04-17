-- Function: Prepare required extension and enums.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.app_role AS ENUM ('admin', 'engineer', 'employee', 'cashier');
CREATE TYPE public.expense_status AS ENUM ('draft', 'submitted', 'under_review', 'verified', 'approved', 'rejected', 'paid');
CREATE TYPE public.expense_category_v2 AS ENUM (
  'travel','lodging','food','transport','office_supplies','software','utilities',
  'marketing','training','health_wellness','equipment','mileage','internet_phone',
  'entertainment','professional_services','rent','other'
);
