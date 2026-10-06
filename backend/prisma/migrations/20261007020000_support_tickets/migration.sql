-- CreateEnum
CREATE TYPE "support_channel" AS ENUM ('MANAGER', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "support_ticket_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'CLOSED');

-- CreateEnum
CREATE TYPE "support_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "support_message_role" AS ENUM ('CLIENT', 'AGENT', 'ADMIN', 'SYSTEM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "support_preferences" JSONB;

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "assigned_to_user_id" UUID,
    "channel" "support_channel" NOT NULL,
    "subject" VARCHAR(240) NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "status" "support_ticket_status" NOT NULL DEFAULT 'OPEN',
    "priority" "support_priority" NOT NULL DEFAULT 'MEDIUM',
    "admin_unread_count" INTEGER NOT NULL DEFAULT 0,
    "client_unread_count" INTEGER NOT NULL DEFAULT 0,
    "first_response_at" TIMESTAMP(3),
    "last_client_message_at" TIMESTAMP(3),
    "last_agent_message_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID,
    "role" "support_message_role" NOT NULL,
    "text" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "idempotency_key" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_org_creator_channel_key"
ON "support_tickets"("organization_id", "created_by_user_id", "channel");

-- CreateIndex
CREATE INDEX "support_tickets_org_status_updated_idx"
ON "support_tickets"("organization_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "support_tickets_assignee_status_updated_idx"
ON "support_tickets"("assigned_to_user_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_ticket_idempotency_key"
ON "support_messages"("ticket_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "support_messages_org_created_idx"
ON "support_messages"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "support_messages_ticket_created_idx"
ON "support_messages"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_tickets"
ADD CONSTRAINT "support_tickets_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets"
ADD CONSTRAINT "support_tickets_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets"
ADD CONSTRAINT "support_tickets_assigned_to_user_id_fkey"
FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages"
ADD CONSTRAINT "support_messages_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages"
ADD CONSTRAINT "support_messages_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages"
ADD CONSTRAINT "support_messages_author_user_id_fkey"
FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
