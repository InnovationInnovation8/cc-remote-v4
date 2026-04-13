// Wake-on-LAN — send magic packet to wake sleeping PCs
import dgram from 'dgram';
import os from 'os';

/**
 * Get MAC address of the primary network interface
 * @returns {string|null} MAC address (e.g., "AA:BB:CC:DD:EE:FF")
 */
export function getLocalMAC() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac.toUpperCase();
      }
    }
  }
  return null;
}

/**
 * Get broadcast address for the local network
 * @returns {string} broadcast address (e.g., "192.168.1.255")
 */
export function getBroadcastAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Calculate broadcast from address + netmask
        const ip = iface.address.split('.').map(Number);
        const mask = iface.netmask.split('.').map(Number);
        const broadcast = ip.map((octet, i) => (octet | (~mask[i] & 0xFF)));
        return broadcast.join('.');
      }
    }
  }
  return '255.255.255.255';
}

/**
 * Send Wake-on-LAN magic packet
 * @param {string} mac - Target MAC address (e.g., "AA:BB:CC:DD:EE:FF" or "AA-BB-CC-DD-EE-FF")
 * @param {string} [broadcastAddr] - Broadcast address (default: auto-detect)
 * @returns {Promise<boolean>}
 */
export function sendWoL(mac, broadcastAddr) {
  return new Promise((resolve, reject) => {
    // Parse MAC address
    const macBytes = mac.replace(/[:\-]/g, '').match(/.{2}/g);
    if (!macBytes || macBytes.length !== 6) {
      return reject(new Error(`Invalid MAC address: ${mac}`));
    }
    const macBuffer = Buffer.from(macBytes.map(b => parseInt(b, 16)));

    // Build magic packet: 6x 0xFF + 16x MAC address = 102 bytes
    const magicPacket = Buffer.alloc(102);
    // 6 bytes of 0xFF
    for (let i = 0; i < 6; i++) magicPacket[i] = 0xFF;
    // 16 repetitions of MAC address
    for (let i = 0; i < 16; i++) macBuffer.copy(magicPacket, 6 + i * 6);

    const addr = broadcastAddr || getBroadcastAddress();
    const socket = dgram.createSocket('udp4');

    socket.once('error', (err) => {
      socket.close();
      reject(err);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(magicPacket, 0, magicPacket.length, 9, addr, (err) => {
        socket.close();
        if (err) reject(err);
        else {
          console.log(`[WoL] Magic packet sent to ${mac} via ${addr}`);
          resolve(true);
        }
      });
    });
  });
}
