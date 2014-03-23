SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

CREATE SCHEMA IF NOT EXISTS `felina` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci ;
USE `felina` ;


-- -----------------------------------------------------
-- Table `felina`.`executables`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`executables` (
  `execid` INT NOT NULL AUTO_INCREMENT,
  `exechash` CHAR(32) NULL,
  `name` VARCHAR(45) NOT NULL,
  `ownerid` INT NOT NULL,
  PRIMARY KEY (`execid`),
  UNIQUE INDEX `exechash_UNIQUE` (`exechash` ASC),
  CONSTRAINT `exec_owner_rel`
    FOREIGN KEY (`ownerid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;

-- -----------------------------------------------------
-- Table `felina`.`DLLs`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`dlls` (
  `dllid` INT NOT NULL AUTO_INCREMENT,
  `dllhash` CHAR(32) NULL,
  `name` VARCHAR(45) NOT NULL,
  `ownerid` INT NOT NULL,
  PRIMARY KEY (`dllid`),
  UNIQUE INDEX `dllhash_UNIQUE` (`dllhash` ASC),
  CONSTRAINT `dll_owner_rel`
    FOREIGN KEY (`ownerid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;

-- -----------------------------------------------------
-- Table `felina`.`projects`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`projects` (
  `projectid` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `desc` VARCHAR(255) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`projectid`),
  UNIQUE INDEX `name_UNIQUE` (`name` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`users` (
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
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `project_users_rel`
    FOREIGN KEY (`assigned_project`)
    REFERENCES `felina`.`projects` (`projectid`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`local_auth`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`local_auth` (
  `userid` INT NOT NULL,
  `hash` CHAR(60) NOT NULL,
  PRIMARY KEY (`userid`),
  CONSTRAINT `user_local_rel`
    FOREIGN KEY (`userid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`ext_auth`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`ext_auth` (
  `userid` INT NOT NULL,
  `provider` VARCHAR(60) NOT NULL,
  `service_id` VARCHAR(60) NOT NULL,
  PRIMARY KEY (`userid`, `provider`),
  CONSTRAINT `user_ext_rel`
    FOREIGN KEY (`userid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`images`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`images` (
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
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `project_image_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felina`.`projects` (`projectid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `uploader_image_rel`
    FOREIGN KEY (`uploaderid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`project_fields`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`project_fields` (
  `fieldid` INT NOT NULL AUTO_INCREMENT,
  `projectid` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  `type` ENUM('apoly', 'arect', 'apoint', 'string', 'number', 'enum') NOT NULL DEFAULT 'apoly',
  `required` TINYINT(1) NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`fieldid`),
  INDEX `project_pfield_rel_idx` (`projectid` ASC),
  CONSTRAINT `project_pfield_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felina`.`projects` (`projectid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`image_meta_string`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`image_meta_string` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `stringval` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`imageid`, `fieldid`),
  INDEX `pfield_mstring_rel_idx` (`fieldid` ASC),
  CONSTRAINT `image_mstring_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felina`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `pfield_mstring_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`project_rights`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`project_rights` (
  `projectid` INT NOT NULL,
  `userid` INT NOT NULL,
  `access_level` INT NOT NULL,
  PRIMARY KEY (`projectid`, `userid`),
  INDEX `user_rights_rel_idx` (`userid` ASC),
  CONSTRAINT `project_rights_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felina`.`projects` (`projectid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `user_rights_rel`
    FOREIGN KEY (`userid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`image_meta_annotations`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`image_meta_annotations` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `region` GEOMETRY NOT NULL,
  PRIMARY KEY (`fieldid`, `imageid`),
  INDEX `image_manno_rel_idx` (`imageid` ASC),
  CONSTRAINT `image_manno_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felina`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `pfield_manno_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`enum_definitions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`enum_definitions` (
  `enumval` INT NOT NULL AUTO_INCREMENT,
  `fieldid` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`enumval`),
  INDEX `pfield_edefs_rel_idx` (`fieldid` ASC),
  CONSTRAINT `pfield_edefs_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`image_meta_number`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`image_meta_number` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `numberval` DOUBLE NOT NULL,
  PRIMARY KEY (`imageid`, `fieldid`),
  INDEX `pfield_mnumber_rel_idx` (`fieldid` ASC),
  CONSTRAINT `image_mnumber_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felina`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `pfield_mnumber_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`image_meta_enum`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`image_meta_enum` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `enumval` INT NOT NULL,
  PRIMARY KEY (`imageid`, `fieldid`),
  INDEX `pfield_menum_rel_idx` (`fieldid` ASC),
  INDEX `enumd_menum_rel_idx` (`enumval` ASC),
  CONSTRAINT `image_menum_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felina`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `pfield_menum_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `enumd_menum_rel`
    FOREIGN KEY (`enumval`)
    REFERENCES `felina`.`enum_definitions` (`enumval`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`jobs`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`jobs` (
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
    REFERENCES `felina`.`projects` (`projectid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `users_jobs_rel`
    FOREIGN KEY (`ownerid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`job_images`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`job_images` (
  `jobid` INT NOT NULL,
  `imagea` CHAR(32) NOT NULL,
  `imageb` CHAR(32) NOT NULL,
  PRIMARY KEY (`jobid`, `imagea`, `imageb`),
  INDEX `images_jimages_relb_idx` (`imageb` ASC),
  CONSTRAINT `jobs_jimages_rel`
    FOREIGN KEY (`jobid`)
    REFERENCES `felina`.`jobs` (`jobid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `images_jimages_rela`
    FOREIGN KEY (`imagea`)
    REFERENCES `felina`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `images_jimages_relb`
    FOREIGN KEY (`imageb`)
    REFERENCES `felina`.`images` (`imageid`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
