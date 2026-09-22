// Device Guard & Authentication Service

export interface DeviceCheckResult {
  allowed: boolean;
  reason?: string;
  device?: {
    id: string;
    approved: boolean;
    deviceName: string;
  };
}

/**
 * Verify Manager Identity & Approved Device Count (max 2 approved devices)
 */
export async function verifyManagerDevice(
  prisma: any,
  managerId: string,
  deviceFingerprint: string,
  deviceName: string = 'Unknown Device'
): Promise<DeviceCheckResult> {
  const manager = await prisma.user.findUnique({
    where: { id: managerId },
    include: { devices: true },
  });

  if (!manager) {
    return { allowed: false, reason: 'Manager account not found' };
  }

  if (manager.role !== 'DOMAIN_MANAGER' && manager.role !== 'MAGEFFICIE_MANAGER' && manager.role !== 'SUPER_ADMIN') {
    return { allowed: false, reason: 'Unauthorized role for manager operation' };
  }

  // Find existing device by fingerprint
  let device = manager.devices.find((d: any) => d.deviceFingerprint === deviceFingerprint);

  if (device) {
    if (!device.approved) {
      return {
        allowed: false,
        reason: 'Device is pending Super Admin approval. Max 2 active devices allowed per manager.',
        device,
      };
    }

    // Update last login
    await prisma.device.update({
      where: { id: device.id },
      data: { lastLogin: new Date() },
    });

    return { allowed: true, device };
  }

  // New device detected. Check approved count
  const approvedDevices = manager.devices.filter((d: any) => d.approved);

  if (approvedDevices.length >= 2) {
    // Create pending unapproved device entry
    const newDevice = await prisma.device.create({
      data: {
        managerId,
        deviceName,
        deviceFingerprint,
        approved: false,
      },
    });

    return {
      allowed: false,
      reason: 'Manager account has reached max 2 approved devices. Third device registered and pending Super Admin approval.',
      device: newDevice,
    };
  }

  // Under limit: auto-approve first 2 devices
  const autoApprovedDevice = await prisma.device.create({
    data: {
      managerId,
      deviceName,
      deviceFingerprint,
      approved: true,
    },
  });

  return { allowed: true, device: autoApprovedDevice };
}
