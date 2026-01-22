-- Check all drivers

USE smart_parking;
SELECT driver_id, full_name, email, phone_number, created_at
FROM driver
ORDER BY driver_id DESC


-- Check added vehicles

USE smart_parking;
SELECT
  plate_no,
  model,
  vehicle_type,
  year,
  driver_id,
  created_at
FROM vehicle
ORDER BY created_at DESC;


-- check log after parking session

USE smart_parking;
SELECT
  log_id,
  driver_id,
  plate_no,
  lot_id,
  spot_label,
  status,
  entry_time
FROM log
WHERE status = 'ACTIVE'
ORDER BY entry_time DESC;


-- after exit, check payment status

USE smart_parking;
SELECT
  log_id,
  plate_no,
  spot_label,
  entry_time,
  exit_time,
  fee,
  status
FROM log
ORDER BY log_id DESC;


-- confirm payment

USE smart_parking;
SELECT
  log_id,
  plate_no,
  entry_time,
  exit_time,
  fee,
  status
FROM log
ORDER BY log_id DESC;

-- confirm payment record exists

USE smart_parking;
SELECT
  payment_id,
  driver_id,
  log_id,
  credit_card_no,
  ccv_cvc,
  cc_expiry,
  amount,
  payment_status,
  payment_date
FROM payment
ORDER BY payment_date DESC;


