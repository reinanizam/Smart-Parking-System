-- ==========================================
-- SMART PARKING (MariaDB / MySQL) - FULL SQL (NO must_pay)
-- Database: smart_parking
-- Rules:
--  - 1 parking_lot -> 1 camera
--  - Driver can NOT have >1 ACTIVE session
--  - Session log status: ACTIVE -> UNPAID -> PAID
--  - opening_hours: HH:MM-HH:MM
-- ==========================================

-- ==========================================
-- FIX AUTHENTICATION ISSUE
-- Change root user to use mysql_native_password instead of GSSAPI/SSPI
-- Run this FIRST in HeidiSQL before running the rest of the script
-- ==========================================
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('parking123');
FLUSH PRIVILEGES;

DROP DATABASE IF EXISTS smart_parking;
CREATE DATABASE smart_parking
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;
USE smart_parking;

-- ------------------------------------------
-- DRIVER
-- ------------------------------------------
CREATE TABLE driver (
  driver_id      INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(120) NOT NULL,
  phone_number   VARCHAR(20)  NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_driver_email UNIQUE (email)
) ENGINE=InnoDB;

-- ------------------------------------------
-- PARKING LOT
-- ------------------------------------------
CREATE TABLE parking_lot (
  lot_id         INT PRIMARY KEY,
  lot_name       VARCHAR(120)  NOT NULL,
  location       VARCHAR(200),
  opening_hours  VARCHAR(11)   NOT NULL DEFAULT '08:00-23:59', -- HH:MM-HH:MM
  entry_fee      DECIMAL(10,2) NOT NULL DEFAULT 3.00,
  hourly_rate    DECIMAL(10,2) NOT NULL DEFAULT 2.00,
  spot_count     INT           NOT NULL,
  lat            DECIMAL(9,6)  NULL,
  lng            DECIMAL(9,6)  NULL,
  currency       VARCHAR(10)   NOT NULL DEFAULT 'USD',
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_spot_count CHECK (spot_count >= 0),
  CONSTRAINT chk_entry_fee  CHECK (entry_fee >= 0),
  CONSTRAINT chk_hourly_rate CHECK (hourly_rate >= 0)
) ENGINE=InnoDB;

-- ------------------------------------------
-- CAMERA (ONE camera per lot)
-- ------------------------------------------
CREATE TABLE camera (
  camera_id  INT PRIMARY KEY,
  lot_id     INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_camera_lot FOREIGN KEY (lot_id) REFERENCES parking_lot(lot_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT uq_camera_lot UNIQUE (lot_id) -- enforces 1:1
) ENGINE=InnoDB;

CREATE INDEX idx_camera_lot ON camera(lot_id);

-- ------------------------------------------
-- VEHICLE
-- ------------------------------------------
CREATE TABLE vehicle (
  plate_no      VARCHAR(20) PRIMARY KEY,
  driver_id     INT NOT NULL,
  vehicle_type  VARCHAR(50),
  color         VARCHAR(50),
  model         VARCHAR(100),
  year          INT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicle_driver FOREIGN KEY (driver_id) REFERENCES driver(driver_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_year CHECK (year IS NULL OR (year >= 1900 AND year <= 2100))
) ENGINE=InnoDB;

CREATE INDEX idx_vehicle_driver ON vehicle(driver_id);

-- ------------------------------------------
-- CREDIT CARD (Saved payment methods)
-- ------------------------------------------
CREATE TABLE credit_card (
  card_id         INT AUTO_INCREMENT PRIMARY KEY,
  driver_id       INT NOT NULL,
  card_nickname   VARCHAR(50) NULL,          -- e.g. "My Visa", "Work Card"
  card_number     VARCHAR(25) NOT NULL,      -- stored with spaces for display
  card_expiry     VARCHAR(5) NOT NULL,       -- MM/YY
  card_cvv        VARCHAR(4) NOT NULL,       -- CVV/CVC
  card_type       VARCHAR(20) DEFAULT 'VISA', -- VISA, MASTERCARD, etc.
  is_default      TINYINT(1) DEFAULT 0,      -- 1 = default card
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_card_driver FOREIGN KEY (driver_id) REFERENCES driver(driver_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_card_driver ON credit_card(driver_id);

-- ------------------------------------------
-- LOG (PARKING SESSION)
-- Status:
--  ACTIVE = currently parked
--  UNPAID = exited, fee computed, not paid
--  PAID   = paid
-- ------------------------------------------
CREATE TABLE `log` (
  log_id       INT AUTO_INCREMENT PRIMARY KEY,

  driver_id    INT NOT NULL,
  plate_no     VARCHAR(20) NOT NULL,

  lot_id       INT NOT NULL,
  camera_id    INT NOT NULL,

  spot_id      VARCHAR(20) NULL,
  spot_label   VARCHAR(20) NULL,

  entry_time   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exit_time    DATETIME NULL,

  fee          DECIMAL(10,2) NULL,

  status       ENUM('ACTIVE','UNPAID','PAID') NOT NULL DEFAULT 'ACTIVE',

  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_log_driver FOREIGN KEY (driver_id) REFERENCES driver(driver_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_log_plate FOREIGN KEY (plate_no) REFERENCES vehicle(plate_no)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_log_lot FOREIGN KEY (lot_id) REFERENCES parking_lot(lot_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_log_camera FOREIGN KEY (camera_id) REFERENCES camera(camera_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT chk_fee_nonneg CHECK (fee IS NULL OR fee >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_log_driver ON `log`(driver_id);
CREATE INDEX idx_log_plate ON `log`(plate_no);
CREATE INDEX idx_log_status ON `log`(status);
CREATE INDEX idx_log_exit_time ON `log`(exit_time);
CREATE INDEX idx_log_lot_status_spot ON `log`(lot_id, status, spot_label);

-- ------------------------------------------
-- PAYMENT
-- ------------------------------------------
CREATE TABLE payment (
  payment_id      INT AUTO_INCREMENT PRIMARY KEY,
  driver_id       INT NOT NULL,
  log_id          INT NOT NULL,

  credit_card_no  VARCHAR(25) NULL,
  ccv_cvc         VARCHAR(4)  NULL,
  cc_expiry       VARCHAR(5)  NULL,  -- MM/YY

  amount          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_status  ENUM('PAID','FAILED') NOT NULL DEFAULT 'PAID',
  payment_date    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_payment_driver FOREIGN KEY (driver_id) REFERENCES driver(driver_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_payment_log FOREIGN KEY (log_id) REFERENCES `log`(log_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT uq_payment_log UNIQUE (log_id),
  CONSTRAINT chk_amount_nonneg CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_payment_driver ON payment(driver_id);

-- ------------------------------------------
-- TRIGGERS: enforce "only 1 ACTIVE session per driver"
--           AND block new reservations if driver has UNPAID logs
-- ------------------------------------------
DELIMITER $$

DROP TRIGGER IF EXISTS trg_log_before_insert_one_active $$
CREATE TRIGGER trg_log_before_insert_one_active
BEFORE INSERT ON `log`
FOR EACH ROW
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    -- Block if driver already has an ACTIVE session
    IF (SELECT COUNT(*)
        FROM `log`
        WHERE driver_id = NEW.driver_id AND status = 'ACTIVE') > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Driver already has an ACTIVE session';
    END IF;
    
    -- Block if driver has any UNPAID sessions
    IF (SELECT COUNT(*)
        FROM `log`
        WHERE driver_id = NEW.driver_id AND status = 'UNPAID') > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot reserve: you have unpaid parking fees. Please pay first.';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_log_before_update_one_active $$
CREATE TRIGGER trg_log_before_update_one_active
BEFORE UPDATE ON `log`
FOR EACH ROW
BEGIN
  IF NEW.status = 'ACTIVE' AND OLD.status <> 'ACTIVE' THEN
    -- Block if driver already has an ACTIVE session
    IF (SELECT COUNT(*)
        FROM `log`
        WHERE driver_id = NEW.driver_id
          AND status = 'ACTIVE'
          AND log_id <> OLD.log_id) > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Driver already has an ACTIVE session';
    END IF;
    
    -- Block if driver has any UNPAID sessions (except this one being updated)
    IF (SELECT COUNT(*)
        FROM `log`
        WHERE driver_id = NEW.driver_id
          AND status = 'UNPAID'
          AND log_id <> OLD.log_id) > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot reserve: you have unpaid parking fees. Please pay first.';
    END IF;
  END IF;
END $$

DELIMITER ;

-- ------------------------------------------
-- SEED DATA
-- ------------------------------------------

INSERT INTO parking_lot (lot_id, lot_name, location, opening_hours, entry_fee, hourly_rate, spot_count, lat, lng, currency) VALUES
(1, 'Verdun Lot',          'Verdun, Beirut',     '08:00-23:59', 5.00, 3.50, 70, 33.890800, 35.480400, 'USD'),
(2, 'Hamra Main Lot',      'Hamra, Beirut',      '07:00-01:00', 4.00, 3.50, 60, 33.895900, 35.482800, 'USD'),
(3, 'Downtown Beirut Lot', 'Downtown, Beirut',   '08:00-02:00', 4.00, 3.00, 80, 33.896600, 35.501800, 'USD'),
(4, 'Achrafieh Lot',       'Achrafieh, Beirut',  '09:00-00:00', 3.00, 2.00, 55, 33.889600, 35.524400, 'USD');

INSERT INTO camera (camera_id, lot_id) VALUES
(1, 1),
(2, 2),
(3, 3),
(4, 4);

-- Test user:
-- email: reina.nizam@test.com
-- password: 1234 (bcrypt hash)
INSERT INTO driver (driver_id, full_name, email, phone_number, password_hash) VALUES
(1, 'Reina Nizam', 'reina.nizam@test.com', '96170123456',
 '$2b$10$qXntbmwKM7KRX/WPCZJgg.GTvk7S44zPvpGXBmKTmROBnbR7Cz.YG');

INSERT INTO vehicle (plate_no, driver_id, vehicle_type, color, model, year) VALUES
('ABC123', 1, 'Sedan', 'Black', 'Toyota Corolla', 2020);

-- Sample credit card for test user
INSERT INTO credit_card (driver_id, card_nickname, card_number, card_expiry, card_cvv, card_type, is_default) VALUES
(1, 'Demo Visa', '4000 1234 5678 9010', '00/00', '123', 'VISA', 1);

SELECT DATABASE() AS current_db;
SHOW TABLES;
SELECT * FROM parking_lot;
SELECT * FROM camera;
SELECT * FROM driver;
SELECT * FROM vehicle;
SELECT * FROM credit_card;
SELECT * FROM `log`;
SELECT * FROM payment;
