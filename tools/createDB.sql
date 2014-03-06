SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

CREATE SCHEMA IF NOT EXISTS `felina` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci ;
USE `felina` ;

-- -----------------------------------------------------
-- Table `felina`.`users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`users` (
  `userid` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(80) NOT NULL,
  `name` VARCHAR(30) NOT NULL DEFAULT 'An Anonymous User',
  `usertype` ENUM('user', 'researcher', 'admin') NOT NULL,
  `gravatar` CHAR(32) NULL,
  `validation_hash` CHAR(32) NULL,
  PRIMARY KEY (`userid`),
  UNIQUE INDEX `email_UNIQUE` (`email` ASC),
  UNIQUE INDEX `validation_hash_UNIQUE` (`validation_hash` ASC))
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
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
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
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
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
-- Table `felina`.`images`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`images` (
  `imageid` CHAR(32) NOT NULL,
  `ownerid` INT NOT NULL,
  `projectid` INT NOT NULL,
  `datetime` DATETIME NULL,
  `location` POINT NULL,
  `private` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`imageid`),
  INDEX `ownerid_idx` (`ownerid` ASC),
  INDEX `projectid_idx` (`projectid` ASC),
  CONSTRAINT `user_image_rel`
    FOREIGN KEY (`ownerid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `project_image_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felina`.`projects` (`projectid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`project_fields`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`project_fields` (
  `fieldid` INT NOT NULL AUTO_INCREMENT,
  `projectid` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  `type` ENUM('anno', 'string', 'number', 'enum') NOT NULL DEFAULT 'anno',
  `required` TINYINT(1) NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`fieldid`),
  INDEX `project_pfield_rel_idx` (`projectid` ASC),
  CONSTRAINT `project_pfield_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felina`.`projects` (`projectid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
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
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `pfield_mstring_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
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
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `user_rights_rel`
    FOREIGN KEY (`userid`)
    REFERENCES `felina`.`users` (`userid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
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
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `pfield_manno_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
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
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
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
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `pfield_mnumber_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
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
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `pfield_menum_rel`
    FOREIGN KEY (`fieldid`)
    REFERENCES `felina`.`project_fields` (`fieldid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `enumd_menum_rel`
    FOREIGN KEY (`enumval`)
    REFERENCES `felina`.`enum_definitions` (`enumval`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
