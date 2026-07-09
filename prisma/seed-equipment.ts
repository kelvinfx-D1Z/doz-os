// Seed: Equipment Categories + Items (28 categories from the master list)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  console.log("Seeding equipment library...");

  const categories: { name: string; icon: string; items: string[] }[] = [
    { name: "Stage & Rigging", icon: "Building2", items: ["Modular stage decks", "Stage risers", "Catwalks", "Thrust stage", "Podiums", "Lecterns", "Stage stairs", "Stage skirting", "Box truss", "Triangle truss", "Goalpost truss", "Circular truss", "Roof truss", "Ground support truss", "Lighting grid", "Chain motors", "Motor controllers", "Shackles", "Steel cables", "Spansets", "Safety bonds", "Hoists", "Base plates"] },
    { name: "Audio Production", icon: "Volume2", items: ["Digital mixing console", "Analog mixer", "Stage box", "Digital snake", "Line array speakers", "Point source speakers", "Front fill speakers", "Delay speakers", "Subwoofers", "Monitors", "Power amplifiers", "DSP processors", "Wireless handheld microphones", "Wireless lapel microphones", "Wireless headset microphones", "Dynamic microphones", "Condenser microphones", "Boundary microphones", "Shotgun microphones", "DI boxes", "Audio splitters", "In-ear monitor systems", "XLR cables", "SpeakON cables", "Mic stands", "Boom stands"] },
    { name: "Video Production", icon: "Video", items: ["Cinema cameras", "Broadcast cameras", "PTZ cameras", "Mirrorless cameras", "DSLR cameras", "ENG cameras", "Action cameras", "Tripods", "Fluid heads", "Monopods", "Sliders", "Jibs", "Cranes", "Gimbals", "Dollies", "Wide angle lenses", "Zoom lenses", "Prime lenses", "Telephoto lenses", "V-Mount batteries", "Memory cards", "Follow focus", "Matte boxes", "ND filters", "Teleprompters"] },
    { name: "Live Video Switching", icon: "Monitor", items: ["Video switcher", "Hardware switcher", "ATEM switcher", "vMix workstation", "TriCaster", "Stream Deck", "T-Bar controller", "Replay system"] },
    { name: "Video Conversion", icon: "Cable", items: ["SDI converters", "HDMI converters", "Fiber converters", "SDI distribution amplifiers", "HDMI splitters", "HDMI extenders", "Matrix switchers", "Scan converters"] },
    { name: "Video Recording", icon: "Disc", items: ["SSD recorders", "HyperDeck recorders", "External recorders", "ISO recorders", "Backup recorders"] },
    { name: "LED Screen System", icon: "LayoutGrid", items: ["Indoor LED wall", "Outdoor LED wall", "Curved LED", "Transparent LED", "Floor LED", "Cabinets", "Frames", "Hanging bars", "Ground support", "Receiving cards", "Sending cards", "Video processors", "LED controllers"] },
    { name: "Projection", icon: "Projector", items: ["Laser projectors", "Short throw projectors", "Projection screens", "Rear projection screens", "Fast fold screens", "Projection lenses"] },
    { name: "Display Systems", icon: "Tv", items: ["Confidence monitors", "Foldback monitors", "Comfort monitors", "Stage displays", "TVs", "Digital signage", "Preview monitors", "Broadcast monitors"] },
    { name: "Lighting", icon: "Lightbulb", items: ["PAR cans", "LED PARs", "Fresnels", "Ellipsoidals", "Moving heads", "Beam lights", "Spot lights", "Wash lights", "Blinders", "Follow spots", "Strobes", "Pixel bars", "LED strips", "Uplights", "Profile fixtures", "Gobos", "Gobo rotators"] },
    { name: "Lighting Control", icon: "Sliders", items: ["Lighting console", "DMX controller", "ArtNet nodes", "DMX splitters", "Wireless DMX", "DMX cables"] },
    { name: "Special Effects (FX)", icon: "Sparkles", items: ["Haze machines", "Fog machines", "Smoke machines", "CO₂ jets", "Sparkular machines", "Flame projectors", "Confetti cannons", "Streamer launchers", "Bubble machines", "Snow machines", "Low fog machines", "Cryo guns"] },
    { name: "Power Distribution", icon: "Zap", items: ["Silent generators", "Backup generators", "UPS systems", "Voltage regulators", "Distribution boxes", "Breaker panels", "Power cables", "Extension cords", "Cable reels", "Three-phase distribution", "Surge protectors"] },
    { name: "Networking", icon: "Network", items: ["Managed switches", "Network routers", "Wi-Fi access points", "Fiber networking", "Ethernet cables", "Network racks", "Internet bonding devices", "Cellular bonding units"] },
    { name: "Streaming", icon: "Radio", items: ["Streaming encoder", "Hardware encoder", "Software encoder", "Bonded internet", "Capture cards", "Streaming PC", "Graphics PC"] },
    { name: "Graphics", icon: "Image", items: ["Presentation laptop", "Playback laptop", "ProPresenter", "PowerPoint", "Keynote", "Playback Pro", "Resolume", "OBS Studio"] },
    { name: "Communication", icon: "MessageSquare", items: ["Wired intercom", "Wireless intercom", "Belt packs", "Base station", "Headsets", "Two-way radios", "IFB systems"] },
    { name: "Event Control", icon: "ClipboardList", items: ["Show caller desk", "Stage manager desk", "Production desk", "Cue lights", "Countdown timers", "Stopwatches", "Show clocks"] },
    { name: "Computers", icon: "Cpu", items: ["Production workstation", "Graphics workstation", "Streaming workstation", "Playback workstation", "Recording workstation"] },
    { name: "Furniture", icon: "Armchair", items: ["Director chairs", "Production tables", "Tech tables", "Folding chairs", "Speaker stools", "Presenter furniture"] },
    { name: "Cable Management", icon: "GitBranch", items: ["Gaffer tape", "Cable ramps", "Velcro ties", "Cable labels", "Zip ties", "Cable bridges", "Cable baskets"] },
    { name: "Backstage", icon: "DoorClosed", items: ["Pipe and drape", "Green room furniture", "Dressing mirrors", "Clothing racks", "Steamers", "Makeup stations"] },
    { name: "Branding", icon: "Palette", items: ["Backdrops", "Step-and-repeat banners", "LED branding", "Roll-up banners", "Stage fascia branding", "Wayfinding signage"] },
    { name: "Event Technology", icon: "Smartphone", items: ["QR Code Registration", "Self Check-in Kiosks", "Badge Printing", "RFID Registration", "Barcode Scanners", "Event App", "Audience Polling", "Live Q&A", "Word Cloud", "Surveys", "Session Attendance Tracking", "Digital Certificates", "Live Voting", "Lead Retrieval", "Exhibitor Management"] },
    { name: "Safety", icon: "Shield", items: ["Fire extinguishers", "First aid kits", "Emergency lighting", "Barricades", "Crowd barriers", "Safety cones", "Safety tape", "PPE", "Hard hats", "Gloves", "Harnesses"] },
    { name: "Tools", icon: "Wrench", items: ["Multi-tools", "Screwdrivers", "Adjustable wrenches", "Socket sets", "Allen keys", "Hammers", "Drills", "Cable testers", "Multimeters", "Flashlights", "Ladders", "Scaffolding"] },
    { name: "Consumables", icon: "Package", items: ["Batteries (AA, AAA, 9V)", "Gaffer tape", "Electrical tape", "Spike tape", "Zip ties", "Velcro", "Markers", "Notepads", "Pens", "Cleaning cloths", "Lens cleaner", "Compressed air", "Hand sanitizer"] },
    { name: "Production Documents", icon: "FileText", items: ["Production schedule", "Run of show", "Cue sheets", "Call sheets", "Crew lists", "Contact lists", "Venue maps", "Emergency plans", "Equipment inventory", "Load-in schedule", "Load-out schedule", "Risk assessment", "Technical rider", "Stage plot", "Audio patch list", "Lighting plot", "Camera plot", "Seating chart"] },
  ];

  let totalItems = 0;
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const existing = await db.equipmentCategory.findFirst({ where: { name: cat.name } });
    if (!existing) {
      const created = await db.equipmentCategory.create({
        data: {
          name: cat.name,
          icon: cat.icon,
          sortOrder: i + 1,
          items: { create: cat.items.map(name => ({ name })) },
        },
      });
      totalItems += cat.items.length;
    }
  }

  console.log(`Seeded ${categories.length} categories with ${totalItems} items`);
  console.log("Equipment library seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
