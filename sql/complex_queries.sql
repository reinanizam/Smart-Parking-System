-- ==========================================
-- COE418 Final Project - Required Complex Queries
-- Smart Parking (MariaDB / MySQL)
--
-- Includes at least:
--  - 2 multi-table JOINs
--  - 1 nested query
--  - 1 aggregate with GROUP BY
--  - 1 set operation (UNION)
-- ==========================================

USE smart_parking;

-- ----------------------------------------------------------
-- Q1) Multi-table JOIN #1: Session history with lot details
-- ----------------------------------------------------------
SELECT
  l.log_id,
  d.full_name,
  l.plate_no,
  p.lot_name,
  l.spot_label,
  l.entry_time,
  l.exit_time,
  l.fee,
  l.status
FROM `log` l
JOIN driver d       ON d.driver_id = l.driver_id
JOIN parking_lot p  ON p.lot_id = l.lot_id
ORDER BY l.log_id DESC;

-- ----------------------------------------------------------
-- Q2) Multi-table JOIN #2: Payments with their corresponding lots
-- ----------------------------------------------------------
SELECT
  pay.payment_id,
  pay.payment_date,
  d.full_name,
  pay.amount,
  pay.payment_status,
  p.lot_name,
  l.log_id
FROM payment pay
JOIN driver d      ON d.driver_id = pay.driver_id
JOIN `log` l       ON l.log_id = pay.log_id
JOIN parking_lot p ON p.lot_id = l.lot_id
ORDER BY pay.payment_date DESC;

-- ----------------------------------------------------------
-- Q3) Nested query: Drivers whose UNPAID total is above the average UNPAID total
-- ----------------------------------------------------------
SELECT
  d.driver_id,
  d.full_name,
  t.unpaid_total
FROM driver d
JOIN (
  SELECT driver_id, COALESCE(SUM(fee),0) AS unpaid_total
  FROM `log`
  WHERE status = 'UNPAID'
  GROUP BY driver_id
) t ON t.driver_id = d.driver_id
WHERE t.unpaid_total > (
  SELECT AVG(x.unpaid_total)
  FROM (
    SELECT COALESCE(SUM(fee),0) AS unpaid_total
    FROM `log`
    WHERE status = 'UNPAID'
    GROUP BY driver_id
  ) x
)
ORDER BY t.unpaid_total DESC;

-- ----------------------------------------------------------
-- Q4) Aggregate with GROUP BY: Lot revenue + session counts
-- ----------------------------------------------------------
SELECT
  p.lot_id,
  p.lot_name,
  COUNT(l.log_id) AS total_sessions,
  SUM(CASE WHEN l.status='ACTIVE' THEN 1 ELSE 0 END) AS active_sessions,
  SUM(CASE WHEN l.status IN ('UNPAID','PAID') THEN 1 ELSE 0 END) AS completed_sessions,
  COALESCE(SUM(CASE WHEN l.status IN ('UNPAID','PAID') THEN l.fee ELSE 0 END),0) AS total_revenue
FROM parking_lot p
LEFT JOIN `log` l ON l.lot_id = p.lot_id
GROUP BY p.lot_id, p.lot_name
ORDER BY p.lot_id;

-- ----------------------------------------------------------
-- Q5) Set operation (UNION): Plates that ever parked OR currently have unpaid dues
-- ----------------------------------------------------------
(SELECT DISTINCT plate_no AS plate, 'EVER_PARKED' AS source FROM `log`)
UNION
(SELECT DISTINCT plate_no AS plate, 'UNPAID' AS source FROM `log` WHERE status='UNPAID')
ORDER BY plate;


