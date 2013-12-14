SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

CREATE SCHEMA IF NOT EXISTS `mydb` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci ;
USE `mydb` ;

-- -----------------------------------------------------
-- Table `mydb`.`users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`users` (
  `userid` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(80) NOT NULL,
  `usertype` ENUM('user', 'researcher', 'admin') NOT NULL,
  PRIMARY KEY (`userid`),
  UNIQUE INDEX `email_UNIQUE` (`email` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`local_auth`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`local_auth` (
  `userid` INT NOT NULL,
  `hash` CHAR(60) NOT NULL,
  PRIMARY KEY (`userid`),
  CONSTRAINT `userid`
    FOREIGN KEY (`userid`)
    REFERENCES `mydb`.`users` (`userid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`ext_auth`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`ext_auth` (
  `userid` INT NOT NULL,
  `provider` VARCHAR(60) NOT NULL,
  `service_id` VARCHAR(60) NOT NULL,
  PRIMARY KEY (`userid`, `provider`),
  CONSTRAINT `userid`
    FOREIGN KEY (`userid`)
    REFERENCES `mydb`.`users` (`userid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`projects`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`projects` (
  `projectid` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(45) NOT NULL,
  `desc` VARCHAR(255) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`projectid`),
  UNIQUE INDEX `name_UNIQUE` (`name` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`images`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`images` (
  `imageid` INT NOT NULL AUTO_INCREMENT,
  `ownerid` INT NOT NULL,
  `projectid` INT NOT NULL,
  `datetime` DATETIME NULL,
  `location` POINT NULL,
  `private` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`imageid`),
  INDEX `ownerid_idx` (`ownerid` ASC),
  INDEX `projectid_idx` (`projectid` ASC),
  CONSTRAINT `ownerid`
    FOREIGN KEY (`ownerid`)
    REFERENCES `mydb`.`users` (`userid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `projectid`
    FOREIGN KEY (`projectid`)
    REFERENCES `mydb`.`projects` (`projectid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`project_fields`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`project_fields` (
  `fieldid` INT NOT NULL AUTO_INCREMENT,
  `projectid` INT NOT NULL,
  `name` VARCHAR(45) NOT NULL,
  `desc` VARCHAR(45) NOT NULL,
  `type` VARCHAR(45) NOT NULL DEFAULT 'text',
  PRIMARY KEY (`fieldid`),
  INDEX `projectid_idx` (`projectid` ASC),
  CONSTRAINT `projectid`
    FOREIGN KEY (`projectid`)
    REFERENCES `mydb`.`projects` (`projectid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`image_metadata`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`image_metadata` (
  `imageid` INT NOT NULL,
  `fieldid` INT NOT NULL,
  `value` VARCHAR(45) NULL,
  PRIMARY KEY (`imageid`, `fieldid`),
  INDEX `fieldid_idx` (`fieldid` ASC),
  CONSTRAINT `imageid`
    FOREIGN KEY (`imageid`)
    REFERENCES `mydb`.`images` (`imageid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fieldid`
    FOREIGN KEY (`fieldid`)
    REFERENCES `mydb`.`project_fields` (`fieldid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`project_rights`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`project_rights` (
  `projectid` INT NOT NULL,
  `userid` INT NOT NULL,
  `access_level` INT NOT NULL,
  PRIMARY KEY (`projectid`, `userid`),
  INDEX `userid_idx` (`userid` ASC),
  CONSTRAINT `projectid`
    FOREIGN KEY (`projectid`)
    REFERENCES `mydb`.`projects` (`projectid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `userid`
    FOREIGN KEY (`userid`)
    REFERENCES `mydb`.`users` (`userid`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
