/**
 * Starter templates: preconfigure connectors (names, order, schematic sides)
 * and PCB/schematic settings. Connector positions are left for the user to
 * click on their artwork.
 */
import type { ConnectorKind, Part, PcbConfig, SchematicSide } from './model'
import { createConnector, createPart } from './model'

export interface TemplatePin {
  name: string
  side?: SchematicSide
  description?: string
}

export interface Template {
  id: string
  label: string
  description: string
  family: string
  kind: ConnectorKind
  pins: TemplatePin[]
  pcb?: Partial<PcbConfig>
  tags?: string[]
}

const pins = (names: string[], side?: SchematicSide): TemplatePin[] => names.map((name) => ({ name, side }))
const sidePins = (left: string[], right: string[]): TemplatePin[] => [...pins(left, 'left'), ...pins(right, 'right')]

export const TEMPLATES: Template[] = [
  { id: 'generic', label: 'Generic module', description: 'Start empty and click connectors on your artwork.', family: 'module', kind: 'generic', pins: [] },
  { id: 'wiring-only', label: 'Wiring-only device', description: 'A device that is wired, never placed on a PCB (controller, power supply, terminal strip).', family: 'device', kind: 'screw', pins: [], pcb: { mode: 'none' } },
  { id: '2pin', label: '2-pin device', description: 'Two connections, e.g. a sensor, LED module or power input.', family: 'device', kind: 'pin', pins: pins(['Pin 1', 'Pin 2']), pcb: { mode: 'generated', template: 'sip' } },
  { id: '3pin', label: '3-pin device', description: 'Signal, power and ground.', family: 'device', kind: 'pin', pins: sidePins(['SIG'], ['VCC', 'GND']), pcb: { mode: 'generated', template: 'sip' } },
  { id: '4pin', label: '4-pin module', description: 'Typical I²C or sensor module.', family: 'module', kind: 'header-pin', pins: sidePins(['VCC', 'GND'], ['SDA', 'SCL']), pcb: { mode: 'generated', template: 'sip' } },
  { id: '6pin', label: '6-pin module', description: 'Serial module or SPI sensor.', family: 'module', kind: 'header-pin', pins: sidePins(['VCC', 'GND', 'TX'], ['RX', 'DTR', 'CTS']), pcb: { mode: 'generated', template: 'sip' } },
  { id: '8pin', label: '8-pin module', description: 'Eight pins in a row.', family: 'module', kind: 'header-pin', pins: sidePins(['VCC', 'GND', 'D0', 'D1'], ['D2', 'D3', 'D4', 'D5']), pcb: { mode: 'generated', template: 'sip' } },
  { id: 'screw-terminal', label: 'Screw terminal', description: 'A 4-way screw terminal block at 5.08 mm pitch.', family: 'terminal block', kind: 'screw', pins: pins(['T1', 'T2', 'T3', 'T4'], 'left'), pcb: { mode: 'generated', template: 'terminal', pitchMm: 5.08, padDiameterMm: 2.4, holeDiameterMm: 1.3 } },
  { id: 'relay', label: 'Relay module', description: 'Single relay board with control input and switched contacts.', family: 'relay module', kind: 'screw', pins: sidePins(['VCC', 'GND', 'IN'], ['NO', 'COM', 'NC']), pcb: { mode: 'none' } },
  { id: 'i2c', label: 'I²C breakout', description: 'Four-pin I²C breakout board.', family: 'breakout', kind: 'header-pin', pins: sidePins(['VCC', 'GND'], ['SDA', 'SCL']), pcb: { mode: 'generated', template: 'sip' } },
  { id: 'spi', label: 'SPI breakout', description: 'Six-pin SPI breakout board.', family: 'breakout', kind: 'header-pin', pins: sidePins(['VCC', 'GND', 'CS'], ['MOSI', 'MISO', 'SCK']), pcb: { mode: 'generated', template: 'sip' } },
  { id: 'motor', label: 'Motor controller', description: 'Dual H-bridge driver (L298N style).', family: 'motor driver', kind: 'screw', pins: sidePins(['VIN', 'GND', '5V', 'ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'], ['OUT1', 'OUT2', 'OUT3', 'OUT4']), pcb: { mode: 'none' } },
  { id: 'psu', label: 'Power supply', description: 'Mains or DC power supply module.', family: 'power supply', kind: 'screw', pins: sidePins(['L', 'N', 'PE'], ['V+', 'V-']), pcb: { mode: 'none' } },
  {
    id: 'esp32',
    label: 'ESP32 board',
    description: '30-pin ESP32 DevKit V1 pinout.',
    family: 'microcontroller board',
    kind: 'header-pin',
    pins: sidePins(
      ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'GND', 'D13', 'VIN'],
      ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3']
    ),
    pcb: { mode: 'generated', template: 'header', rows: 2, pitchMm: 2.54, rowSpacingMm: 25.4 }
  },
  {
    id: 'rpi-hat',
    label: 'Raspberry Pi HAT',
    description: '40-pin GPIO header, physical pin order.',
    family: 'raspberry pi hat',
    kind: 'header-socket',
    pins: sidePins(
      ['3V3', 'GPIO2 SDA', 'GPIO3 SCL', 'GPIO4', 'GND', 'GPIO17', 'GPIO27', 'GPIO22', '3V3 ', 'GPIO10 MOSI', 'GPIO9 MISO', 'GPIO11 SCK', 'GND ', 'ID_SD', 'GPIO5', 'GPIO6', 'GPIO13', 'GPIO19', 'GPIO26', 'GND  '],
      ['5V', '5V ', 'GND   ', 'GPIO14 TXD', 'GPIO15 RXD', 'GPIO18', 'GND    ', 'GPIO23', 'GPIO24', 'GND     ', 'GPIO25', 'GPIO8 CE0', 'GPIO7 CE1', 'ID_SC', 'GND      ', 'GPIO12', 'GND       ', 'GPIO16', 'GPIO20', 'GPIO21']
    ),
    pcb: { mode: 'generated', template: 'header', rows: 2, pitchMm: 2.54, rowSpacingMm: 2.54 }
  },
  {
    id: 'arduino-shield',
    label: 'Arduino shield',
    description: 'Uno R3 header pinout.',
    family: 'arduino shield',
    kind: 'header-pin',
    pins: sidePins(
      ['IOREF', 'RESET', '3V3', '5V', 'GND', 'GND ', 'VIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
      ['SCL', 'SDA', 'AREF', 'GND  ', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0']
    ),
    pcb: { mode: 'generated', template: 'header', rows: 1 }
  }
]

export function partFromTemplate(t: Template, title: string): Part {
  const part = createPart(title, { family: t.family, tags: t.tags ?? [] })
  part.connectors = t.pins.map((p, i) =>
    createConnector({
      kind: t.kind,
      name: p.name.trim(),
      number: i + 1,
      description: p.description ?? '',
      schematic: { side: p.side ?? 'auto', order: i, label: null, hidden: false }
    })
  )
  if (t.pcb) part.pcb = { ...part.pcb, ...t.pcb }
  return part
}
