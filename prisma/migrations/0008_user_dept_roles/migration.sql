-- AlterTable: add deptRoles to User
ALTER TABLE "User" ADD COLUMN "deptRoles" TEXT NOT NULL DEFAULT '[]';
