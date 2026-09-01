CREATE TABLE `employee_loans` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`employee_id` text NOT NULL,
	`kind` text DEFAULT 'loan' NOT NULL,
	`principal` integer NOT NULL,
	`monthly_deduction` integer NOT NULL,
	`start_period` text NOT NULL,
	`issued_on` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`reason` text,
	`notes` text,
	`cancelled_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_loans_reference_idx` ON `employee_loans` (`reference`);--> statement-breakpoint
CREATE INDEX `employee_loans_employee_idx` ON `employee_loans` (`employee_id`);--> statement-breakpoint
CREATE TABLE `loan_repayments` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`payslip_id` text,
	`amount` integer NOT NULL,
	`period` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`loan_id`) REFERENCES `employee_loans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `loan_repayments_loan_idx` ON `loan_repayments` (`loan_id`);--> statement-breakpoint
CREATE INDEX `loan_repayments_payslip_idx` ON `loan_repayments` (`payslip_id`);--> statement-breakpoint
ALTER TABLE `payslips` ADD `paye_override` integer;