SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

CREATE SCHEMA IF NOT EXISTS `felinaTest` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci ;
USE `felinaTest` ;

-- -----------------------------------------------------
-- Table `felinaTest`.`projects`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`projects` (
  `projectid` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `desc` VARCHAR(255) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`projectid`),
  UNIQUE INDEX `name_UNIQUE` (`name` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`users` (
  `userid` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(80) NOT NULL,
  `name` VARCHAR(30) NOT NULL DEFAULT 'An Anonymous User',
  `usertype` ENUM('subuser', 'user', 'researcher', 'admin') NOT NULL,
  `gravatar` CHAR(32) NULL,
  `validation_hash` CHAR(32) NULL,
  `supervisor` INT NULL,
  `token_expiry` DATETIME NULL,
  `assigned_project` INT NULL,
  PRIMARY KEY (`userid`),
  UNIQUE INDEX `email_UNIQUE` (`email` ASC),
  UNIQUE INDEX `validation_hash_UNIQUE` (`validation_hash` ASC),
  INDEX `users_users_rel_idx` (`supervisor` ASC),
  INDEX `project_users_rel_idx` (`assigned_project` ASC),
  CONSTRAINT `users_users_rel`
    FOREIGN KEY (`supervisor`)
    REFERENCES `felinaTest`.`users` (`userid`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `project_users_rel`
    FOREIGN KEY (`assigned_project`)
    REFERENCES `felinaTest`.`projects` (`projectid`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`local_auth`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`local_auth` (
  `userid` INT NOT NULL,
  `hash` CHAR(60) NOT NULL,
  PRIMARY KEY (`userid`),
  CONSTRAINT `user_local_rel`
    FOREIGN KEY (`userid`)
    REFERENCES `felinaTest`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`ext_auth`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`ext_auth` (
  `userid` INT NOT NULL,
  `provider` VARCHAR(60) NOT NULL,
  `service_id` VARCHAR(60) NOT NULL,
  PRIMARY KEY (`userid`, `provider`),
  CONSTRAINT `user_ext_rel`
    FOREIGN KEY (`userid`)
    REFERENCES `felinaTest`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`images`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`images` (
  `imageid` CHAR(32) NOT NULL,
  `ownerid` INT NOT NULL,
  `projectid` INT NOT NULL,
  `uploaderid` INT NOT NULL,
  `datetime` DATETIME NULL,
  `location` POINT NULL,
  `private` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`imageid`),
  INDEX `ownerid_idx` (`ownerid` ASC),
  INDEX `projectid_idx` (`projectid` ASC),
  INDEX `uploader_image_rel_idx` (`uploaderid` ASC),
  CONSTRAINT `user_image_rel`
    FOREIGN KEY (`ownerid`)
    REFERENCES `felinaTest`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `project_image_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felinaTest`.`projects` (`projectid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `uploader_image_rel`
    FOREIGN KEY (`uploaderid`)
    REFERENCES `felinaTest`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`project_fields`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`project_fields` (
  `fieldid` INT NOT NULL AUTO_INCREMENT,
  `projectid` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  `type` ENUM('apoly', 'arect', 'apoint', 'string', 'number', 'enum') NOT NULL DEFAULT 'apoly',
  `required` TINYINT(1) NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`fieldid`),
  INDEX `project_pfield_rel_idx` (`projectid` ASC),
  CONSTRAINT `project_pfield_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felinaTest`.`projects` (`projectid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`image_meta_string`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`image_meta_string` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `stringval` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`imageid`, `fieldid`),
  INDEX `pfield_mstring_rel_idx` (`fieldid` ASC),
  CONSTRAINT `image_mstring_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felinaTest`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `pfield_mstring_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felinaTest`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`project_rights`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`project_rights` (
  `projectid` INT NOT NULL,
  `userid` INT NOT NULL,
  `access_level` INT NOT NULL,
  PRIMARY KEY (`projectid`, `userid`),
  INDEX `user_rights_rel_idx` (`userid` ASC),
  CONSTRAINT `project_rights_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felinaTest`.`projects` (`projectid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `user_rights_rel`
    FOREIGN KEY (`userid`)
    REFERENCES `felinaTest`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`image_meta_annotations`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`image_meta_annotations` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `region` GEOMETRY NOT NULL,
  PRIMARY KEY (`fieldid`, `imageid`),
  INDEX `image_manno_rel_idx` (`imageid` ASC),
  CONSTRAINT `image_manno_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felinaTest`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `pfield_manno_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felinaTest`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`enum_definitions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`enum_definitions` (
  `enumval` INT NOT NULL AUTO_INCREMENT,
  `fieldid` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`enumval`),
  INDEX `pfield_edefs_rel_idx` (`fieldid` ASC),
  CONSTRAINT `pfield_edefs_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felinaTest`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`image_meta_number`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`image_meta_number` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `numberval` DOUBLE NOT NULL,
  PRIMARY KEY (`imageid`, `fieldid`),
  INDEX `pfield_mnumber_rel_idx` (`fieldid` ASC),
  CONSTRAINT `image_mnumber_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felinaTest`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `pfield_mnumber_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felinaTest`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`image_meta_enum`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`image_meta_enum` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `enumval` INT NOT NULL,
  PRIMARY KEY (`imageid`, `fieldid`),
  INDEX `pfield_menum_rel_idx` (`fieldid` ASC),
  INDEX `enumd_menum_rel_idx` (`enumval` ASC),
  CONSTRAINT `image_menum_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felinaTest`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `pfield_menum_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felinaTest`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `enumd_menum_rel`
    FOREIGN KEY (`enumval`)
    REFERENCES `felinaTest`.`enum_definitions` (`enumval`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`jobs`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`jobs` (
  `jobid` INT NOT NULL AUTO_INCREMENT,
  `projectid` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  `ownerid` INT NULL,
  `exe_pack` VARCHAR(45) NULL,
  PRIMARY KEY (`jobid`),
  INDEX `project_jobs_rel_idx` (`projectid` ASC),
  INDEX `users_jobs_rel_idx` (`ownerid` ASC),
  CONSTRAINT `project_jobs_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felinaTest`.`projects` (`projectid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `users_jobs_rel`
    FOREIGN KEY (`ownerid`)
    REFERENCES `felinaTest`.`users` (`userid`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felinaTest`.`job_images`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felinaTest`.`job_images` (
  `jobid` INT NOT NULL,
  `imagea` CHAR(32) NOT NULL,
  `imageb` CHAR(32) NOT NULL,
  PRIMARY KEY (`jobid`, `imagea`, `imageb`),
  INDEX `images_jimages_relb_idx` (`imageb` ASC),
  CONSTRAINT `jobs_jimages_rel`
    FOREIGN KEY (`jobid`)
    REFERENCES `felinaTest`.`jobs` (`jobid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `images_jimages_rela`
    FOREIGN KEY (`imagea`)
    REFERENCES `felinaTest`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `images_jimages_relb`
    FOREIGN KEY (`imageb`)
    REFERENCES `felinaTest`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;

-- SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
-- SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
-- SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

-- CREATE SCHEMA IF NOT EXISTS `felinaTestTest` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci ;
-- USE `felinaTestTest` ;

-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`users`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`users` (
--   `userid` INT NOT NULL AUTO_INCREMENT,
--   `email` VARCHAR(80) NOT NULL,
--   `name` VARCHAR(30) NOT NULL DEFAULT 'An Anonymous User',
--   `usertype` ENUM('user', 'researcher', 'admin') NOT NULL,
--   `gravatar` CHAR(32) NULL,
--   `validation_hash` CHAR(32) NULL,
--   PRIMARY KEY (`userid`),
--   UNIQUE INDEX `email_UNIQUE` (`email` ASC),
--   UNIQUE INDEX `validation_hash_UNIQUE` (`validation_hash` ASC))
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`local_auth`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`local_auth` (
--   `userid` INT NOT NULL,
--   `hash` CHAR(60) NOT NULL,
--   PRIMARY KEY (`userid`),
--   CONSTRAINT `user_local_rel`
--     FOREIGN KEY (`userid`)
--     REFERENCES `felinaTestTest`.`users` (`userid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`ext_auth`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`ext_auth` (
--   `userid` INT NOT NULL,
--   `provider` VARCHAR(60) NOT NULL,
--   `service_id` VARCHAR(60) NOT NULL,
--   PRIMARY KEY (`userid`, `provider`),
--   CONSTRAINT `user_ext_rel`
--     FOREIGN KEY (`userid`)
--     REFERENCES `felinaTestTest`.`users` (`userid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`projects`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`projects` (
--   `projectid` INT NOT NULL AUTO_INCREMENT,
--   `name` VARCHAR(45) NOT NULL,
--   `desc` VARCHAR(255) NOT NULL,
--   `active` TINYINT(1) NOT NULL DEFAULT 0,
--   PRIMARY KEY (`projectid`),
--   UNIQUE INDEX `name_UNIQUE` (`name` ASC))
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`images`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`images` (
--   `imageid` CHAR(32) NOT NULL,
--   `ownerid` INT NOT NULL,
--   `projectid` INT NOT NULL,
--   `datetime` DATETIME NULL,
--   `location` POINT NULL,
--   `private` TINYINT(1) NOT NULL DEFAULT 1,
--   PRIMARY KEY (`imageid`),
--   INDEX `ownerid_idx` (`ownerid` ASC),
--   INDEX `projectid_idx` (`projectid` ASC),
--   CONSTRAINT `user_image_rel`
--     FOREIGN KEY (`ownerid`)
--     REFERENCES `felinaTestTest`.`users` (`userid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `project_image_rel`
--     FOREIGN KEY (`projectid`)
--     REFERENCES `felinaTestTest`.`projects` (`projectid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`project_fields`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`project_fields` (
--   `fieldid` INT NOT NULL AUTO_INCREMENT,
--   `projectid` INT NOT NULL,
--   `name` VARCHAR(45) NOT NULL,
--   `type` ENUM('apoly', 'arect', 'apoint', 'string', 'number', 'enum') NOT NULL DEFAULT 'apoly',
--   `required` TINYINT(1) NOT NULL DEFAULT TRUE,
--   PRIMARY KEY (`fieldid`),
--   INDEX `project_pfield_rel_idx` (`projectid` ASC),
--   CONSTRAINT `project_pfield_rel`
--     FOREIGN KEY (`projectid`)
--     REFERENCES `felinaTestTest`.`projects` (`projectid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`image_meta_string`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`image_meta_string` (
--   `imageid` CHAR(32) NOT NULL,
--   `fieldid` INT NOT NULL,
--   `stringval` VARCHAR(45) NOT NULL,
--   PRIMARY KEY (`imageid`, `fieldid`),
--   INDEX `pfield_mstring_rel_idx` (`fieldid` ASC),
--   CONSTRAINT `image_mstring_rel`
--     FOREIGN KEY (`imageid`)
--     REFERENCES `felinaTestTest`.`images` (`imageid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `pfield_mstring_rel`
--     FOREIGN KEY (`fieldid`)
--     REFERENCES `felinaTestTest`.`project_fields` (`fieldid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`project_rights`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`project_rights` (
--   `projectid` INT NOT NULL,
--   `userid` INT NOT NULL,
--   `access_level` INT NOT NULL,
--   PRIMARY KEY (`projectid`, `userid`),
--   INDEX `user_rights_rel_idx` (`userid` ASC),
--   CONSTRAINT `project_rights_rel`
--     FOREIGN KEY (`projectid`)
--     REFERENCES `felinaTestTest`.`projects` (`projectid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `user_rights_rel`
--     FOREIGN KEY (`userid`)
--     REFERENCES `felinaTestTest`.`users` (`userid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`image_meta_annotations`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`image_meta_annotations` (
--   `imageid` CHAR(32) NOT NULL,
--   `fieldid` INT NOT NULL,
--   `region` GEOMETRY NOT NULL,
--   PRIMARY KEY (`fieldid`, `imageid`),
--   INDEX `image_manno_rel_idx` (`imageid` ASC),
--   CONSTRAINT `image_manno_rel`
--     FOREIGN KEY (`imageid`)
--     REFERENCES `felinaTestTest`.`images` (`imageid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `pfield_manno_rel`
--     FOREIGN KEY (`fieldid`)
--     REFERENCES `felinaTestTest`.`project_fields` (`fieldid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`enum_definitions`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`enum_definitions` (
--   `enumval` INT NOT NULL AUTO_INCREMENT,
--   `fieldid` INT NOT NULL,
--   `name` VARCHAR(45) NOT NULL,
--   PRIMARY KEY (`enumval`),
--   INDEX `pfield_edefs_rel_idx` (`fieldid` ASC),
--   CONSTRAINT `pfield_edefs_rel`
--     FOREIGN KEY (`fieldid`)
--     REFERENCES `felinaTestTest`.`project_fields` (`fieldid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`image_meta_number`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`image_meta_number` (
--   `imageid` CHAR(32) NOT NULL,
--   `fieldid` INT NOT NULL,
--   `numberval` DOUBLE NOT NULL,
--   PRIMARY KEY (`imageid`, `fieldid`),
--   INDEX `pfield_mnumber_rel_idx` (`fieldid` ASC),
--   CONSTRAINT `image_mnumber_rel`
--     FOREIGN KEY (`imageid`)
--     REFERENCES `felinaTestTest`.`images` (`imageid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `pfield_mnumber_rel`
--     FOREIGN KEY (`fieldid`)
--     REFERENCES `felinaTestTest`.`project_fields` (`fieldid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`image_meta_enum`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`image_meta_enum` (
--   `imageid` CHAR(32) NOT NULL,
--   `fieldid` INT NOT NULL,
--   `enumval` INT NOT NULL,
--   PRIMARY KEY (`imageid`, `fieldid`),
--   INDEX `pfield_menum_rel_idx` (`fieldid` ASC),
--   INDEX `enumd_menum_rel_idx` (`enumval` ASC),
--   CONSTRAINT `image_menum_rel`
--     FOREIGN KEY (`imageid`)
--     REFERENCES `felinaTestTest`.`images` (`imageid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `pfield_menum_rel`
--     FOREIGN KEY (`fieldid`)
--     REFERENCES `felinaTestTest`.`project_fields` (`fieldid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `enumd_menum_rel`
--     FOREIGN KEY (`enumval`)
--     REFERENCES `felinaTestTest`.`enum_definitions` (`enumval`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`jobs`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`jobs` (
--   `jobid` INT NOT NULL AUTO_INCREMENT,
--   `projectid` INT NOT NULL,
--   `name` VARCHAR(45) NOT NULL,
--   `ownerid` INT NOT NULL,
--   `exe_pack` VARCHAR(45) NULL,
--   PRIMARY KEY (`jobid`),
--   INDEX `project_jobs_rel_idx` (`projectid` ASC),
--   INDEX `users_jobs_rel_idx` (`ownerid` ASC),
--   CONSTRAINT `project_jobs_rel`
--     FOREIGN KEY (`projectid`)
--     REFERENCES `felinaTestTest`.`projects` (`projectid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `users_jobs_rel`
--     FOREIGN KEY (`ownerid`)
--     REFERENCES `felinaTestTest`.`users` (`userid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- -- -----------------------------------------------------
-- -- Table `felinaTestTest`.`job_images`
-- -- -----------------------------------------------------
-- CREATE TABLE IF NOT EXISTS `felinaTestTest`.`job_images` (
--   `jobid` INT NOT NULL,
--   `imagea` CHAR(32) NOT NULL,
--   `imageb` CHAR(32) NOT NULL,
--   PRIMARY KEY (`jobid`, `imagea`, `imageb`),
--   INDEX `images_jimages_relb_idx` (`imageb` ASC),
--   CONSTRAINT `jobs_jimages_rel`
--     FOREIGN KEY (`jobid`)
--     REFERENCES `felinaTestTest`.`jobs` (`jobid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `images_jimages_rela`
--     FOREIGN KEY (`imagea`)
--     REFERENCES `felinaTestTest`.`images` (`imageid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION,
--   CONSTRAINT `images_jimages_relb`
--     FOREIGN KEY (`imageb`)
--     REFERENCES `felinaTestTest`.`images` (`imageid`)
--     ON DELETE NO ACTION
--     ON UPDATE NO ACTION)
-- ENGINE = InnoDB;


-- SET SQL_MODE=@OLD_SQL_MODE;
-- SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
-- SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
