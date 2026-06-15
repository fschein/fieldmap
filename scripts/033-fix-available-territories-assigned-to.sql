-- ============================================================
-- Migration 033: Corrige inconsistência em territories
-- ============================================================
-- Zera assigned_to em territórios com status = 'available'
-- mas assigned_to preenchido. Estado inconsistente causado por
-- devoluções/conclusões que não limparam os dois campos juntos.
-- ============================================================

UPDATE territories
SET assigned_to = NULL
WHERE status = 'available'
  AND assigned_to IS NOT NULL;
