import prisma from "@/lib/prisma";
import { logger } from "@/lib/logging/logger";
import { NotFoundError, ServiceError } from "@/lib/logging/errors";

const log = logger.child({ service: "SchedulePresetService" });

export async function getSchedulePresets() {
  return prisma.schedulePreset.findMany({ orderBy: { name: "asc" } });
}

export async function getSchedulePreset(id: string) {
  const preset = await prisma.schedulePreset.findUnique({ where: { id } });
  if (!preset) throw new NotFoundError("SchedulePreset", id);
  return preset;
}

export async function createSchedulePreset(input: {
  name: string;
  description?: string;
  schedule: string;
}) {
  const existing = await prisma.schedulePreset.findUnique({
    where: { name: input.name },
  });
  if (existing) {
    throw new ServiceError("SchedulePresetService", "createSchedulePreset", `A schedule preset named "${input.name}" already exists.`);
  }

  const preset = await prisma.schedulePreset.create({
    data: {
      name: input.name,
      description: input.description,
      schedule: input.schedule,
    },
  });

  log.info("Schedule preset created", { id: preset.id, name: preset.name });
  return preset;
}

export async function updateSchedulePreset(
  id: string,
  input: {
    name?: string;
    description?: string;
    schedule?: string;
  }
) {
  const preset = await prisma.schedulePreset.findUnique({ where: { id } });
  if (!preset) throw new NotFoundError("SchedulePreset", id);

  if (input.name && input.name !== preset.name) {
    const existing = await prisma.schedulePreset.findUnique({
      where: { name: input.name },
    });
    if (existing) {
      throw new ServiceError("SchedulePresetService", "updateSchedulePreset", `A schedule preset named "${input.name}" already exists.`);
    }
  }

  const updated = await prisma.schedulePreset.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.schedule !== undefined && { schedule: input.schedule }),
    },
  });

  log.info("Schedule preset updated", { id });
  return updated;
}

export async function deleteSchedulePreset(id: string) {
  const preset = await prisma.schedulePreset.findUnique({ where: { id } });
  if (!preset) throw new NotFoundError("SchedulePreset", id);

  await prisma.schedulePreset.delete({ where: { id } });
  log.info("Schedule preset deleted", { id });
}
