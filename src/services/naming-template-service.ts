import prisma from "@/lib/prisma";
import { logger } from "@/lib/logging/logger";
import { NotFoundError, ServiceError } from "@/lib/logging/errors";

const log = logger.child({ service: "NamingTemplateService" });

export async function getNamingTemplates() {
  return prisma.namingTemplate.findMany({ orderBy: { name: "asc" } });
}

export async function getNamingTemplate(id: string) {
  const template = await prisma.namingTemplate.findUnique({ where: { id } });
  if (!template) throw new NotFoundError("NamingTemplate", id);
}

export async function getDefaultNamingTemplate() {
  return prisma.namingTemplate.findFirst({ where: { isDefault: true } });
}

export async function createNamingTemplate(input: {
  name: string;
  description?: string;
  pattern: string;
  isDefault?: boolean;
}) {
  const existing = await prisma.namingTemplate.findUnique({
    where: { name: input.name },
  });
  if (existing) {
    throw new ServiceError("NamingTemplateService", "createNamingTemplate", `A naming template named "${input.name}" already exists.`);
  }

  if (input.isDefault) {
    await prisma.namingTemplate.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const template = await prisma.namingTemplate.create({
    data: {
      name: input.name,
      description: input.description,
      pattern: input.pattern,
      isDefault: input.isDefault ?? false,
      isSystem: false,
    },
  });

  log.info("Naming template created", { id: template.id, name: template.name });
  return template;
}

export async function updateNamingTemplate(
  id: string,
  input: {
    name?: string;
    description?: string;
    pattern?: string;
    isDefault?: boolean;
  }
) {
  const template = await prisma.namingTemplate.findUnique({ where: { id } });
  if (!template) throw new NotFoundError("NamingTemplate", id);
  if (template.isSystem) {
    throw new ServiceError("NamingTemplateService", "updateNamingTemplate", "System templates cannot be modified.");
  }

  if (input.name && input.name !== template.name) {
    const existing = await prisma.namingTemplate.findUnique({
      where: { name: input.name },
    });
    if (existing) {
      throw new ServiceError("NamingTemplateService", "updateNamingTemplate", `A naming template named "${input.name}" already exists.`);
    }
  }

  if (input.isDefault) {
    await prisma.namingTemplate.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.namingTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.pattern !== undefined && { pattern: input.pattern }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
    },
  });

  log.info("Naming template updated", { id });
  return updated;
}

export async function deleteNamingTemplate(id: string) {
  const template = await prisma.namingTemplate.findUnique({
    where: { id },
    include: { jobs: { select: { id: true } } },
  });
  if (!template) throw new NotFoundError("NamingTemplate", id);
  if (template.isSystem) {
    throw new ServiceError("NamingTemplateService", "deleteNamingTemplate", "System templates cannot be deleted.");
  }
  if (template.isDefault) {
    throw new ServiceError("NamingTemplateService", "deleteNamingTemplate", "Cannot delete the default naming template. Set another template as default first.");
  }
  if (template.jobs.length > 0) {
    throw new ServiceError("NamingTemplateService", "deleteNamingTemplate", `Cannot delete: template is used by ${template.jobs.length} job(s). Update jobs first.`);
  }

  await prisma.namingTemplate.delete({ where: { id } });
  log.info("Naming template deleted", { id });
}
