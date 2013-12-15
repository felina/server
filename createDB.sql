SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

CREATE SCHEMA IF NOT EXISTS `felina`;

-- -----------------------------------------------------
-- Table `felina`.`users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`users` (
  `userid` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(80) NOT NULL,
  `name` VARCHAR(30) NOT NULL DEFAULT 'An Anonymous User',
  `usertype` ENUM('user', 'researcher', 'admin') NOT NULL,
  PRIMARY KEY (`userid`),
  UNIQUE INDEX `email_UNIQUE` (`email` ASC))
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
  `desc` VARCHAR(45) NOT NULL,
  `type` VARCHAR(45) NOT NULL DEFAULT 'text',
  PRIMARY KEY (`fieldid`),
  INDEX `projectid_idx` (`projectid` ASC),
  CONSTRAINT `project_pfield_rel`
    FOREIGN KEY (`projectid`)
    REFERENCES `felina`.`projects` (`projectid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `felina`.`image_metadata`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `felina`.`image_metadata` (
  `imageid` CHAR(32) NOT NULL,
  `fieldid` INT NOT NULL,
  `value` VARCHAR(45) NULL,
  PRIMARY KEY (`imageid`, `fieldid`),
  INDEX `fieldid_idx` (`fieldid` ASC),
  CONSTRAINT `image_meta_rel`
    FOREIGN KEY (`imageid`)
    REFERENCES `felina`.`images` (`imageid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `pfield_field_rel`
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
  INDEX `userid_idx` (`userid` ASC),
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


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
