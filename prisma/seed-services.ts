import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  console.log("Seeding service library...");

  const categories: { name: string; icon: string; items: string[] }[] = [
    { name: "Event Production Management", icon: "ClipboardList", items: ["Event production planning","Production management","Technical production management","Event logistics","Vendor coordination","Budget management","Production scheduling","Site inspections","Technical meetings","Show calling","Run of show development","On-site event management","Load-in and load-out management","Crew management"] },
    { name: "Creative & Event Design", icon: "Palette", items: ["Event concept development","Theme development","Stage design","Scenic design","Experience design","Set construction","Exhibition stand design","Exhibition stand fabrication","Venue transformation","Interior event styling","Event branding","Wayfinding design","Environmental graphics"] },
    { name: "Audio Production", icon: "Volume2", items: ["Sound system design","Audio equipment rental","Public address (PA) systems","Conference audio systems","Concert sound reinforcement","Wireless microphone systems","Simultaneous interpretation systems","Interpretation booths","Audio recording","Live audio mixing","Broadcast audio","DJ sound systems","In-ear monitoring systems"] },
    { name: "Lighting Production", icon: "Lightbulb", items: ["Lighting design","Lighting programming","Lighting equipment rental","Architectural lighting","Stage lighting","Concert lighting","Intelligent lighting","Ambient lighting","Decorative lighting","Outdoor lighting","Follow spot operation","Lighting visualization"] },
    { name: "Video Production", icon: "Video", items: ["Multi-camera production","Camera crew","Live switching","IMAG (Image Magnification)","Live projection","LED screen content management","Video recording","Broadcast production","Event videography","Highlight videos","Event documentaries","Same-day edits (SDE)","Corporate video production"] },
    { name: "Live Streaming & Hybrid Events", icon: "Radio", items: ["Live streaming","Webinar production","Virtual event production","Hybrid event production","Remote speaker integration","Streaming platform management","Broadcast encoding","Cloud production","Multi-platform streaming","Online audience engagement"] },
    { name: "LED Display Services", icon: "LayoutGrid", items: ["LED wall rental","LED wall installation","LED wall operation","Outdoor LED displays","Indoor LED displays","Digital signage","Content mapping","Video processing"] },
    { name: "Projection Services", icon: "Projector", items: ["Projection mapping","Large venue projection","Rear projection","Multi-projector blending","Edge blending","Projection design"] },
    { name: "Stage & Rigging Services", icon: "Building2", items: ["Stage construction","Truss installation","Roof systems","Rigging","Chain motor installation","Scenic installation","Stage decking","Catwalk construction","VIP platform construction"] },
    { name: "Event Technology", icon: "Smartphone", items: ["Online registration","Event ticketing","QR code ticketing","Badge printing","Access control","Attendee check-in","RFID registration","NFC registration","Event apps","Interactive audience engagement","Live polls","Live Q&A","Word clouds","Surveys","Event analytics","Lead retrieval","Session tracking","Certificate generation","Digital networking","Sponsor portals","Exhibitor portals","Agenda management"] },
    { name: "Exhibition Services", icon: "Store", items: ["Exhibition stand design","Exhibition stand fabrication","Modular exhibition systems","Custom exhibition stands","Booth installation","Booth dismantling","Exhibition furniture","Branding installation","Trade show logistics"] },
    { name: "Event Branding", icon: "Brush", items: ["Stage backdrops","LED content design","Event graphics","Signage production","Roll-up banners","Wayfinding","Fabric printing","Large format printing","Venue branding","Sponsor branding"] },
    { name: "Scenic Fabrication", icon: "Hammer", items: ["Set construction","Scenic carpentry","Scenic painting","Scenic installation","Foam carving","CNC fabrication","Acrylic fabrication","Metal fabrication"] },
    { name: "Photography Services", icon: "Camera", items: ["Event photography","Corporate photography","Conference photography","Award ceremony photography","VIP photography","Drone photography","Photo booth services","Instant printing"] },
    { name: "Drone Services", icon: "Plane", items: ["Aerial photography","Aerial videography","Live aerial broadcast","Site inspection","Promotional drone footage"] },
    { name: "Broadcast Services", icon: "Tv", items: ["Television broadcast","Satellite uplink","Outside broadcast (OB)","Remote production","Live transmission","Broadcast graphics","Broadcast recording"] },
    { name: "Content Production", icon: "Film", items: ["Motion graphics","Opening videos","Countdown videos","Speaker walk-on videos","Award nominee videos","Corporate videos","Social media content","Event trailers","Promo videos","Animated presentations"] },
    { name: "Presentation Management", icon: "Monitor", items: ["PowerPoint design","Keynote management","Presentation rehearsals","Speaker support","Teleprompter services","Confidence monitors","Presentation switching"] },
    { name: "Special Effects", icon: "Sparkles", items: ["Confetti","Cold sparks","CO₂ effects","Flame effects","Haze","Fog","Snow effects","Bubble effects","Laser shows","Pyrotechnics"] },
    { name: "Internet & Networking", icon: "Network", items: ["Event Wi-Fi","Temporary internet","Dedicated fiber","Network design","Streaming networks","VLAN configuration","IT support"] },
    { name: "Power Services", icon: "Zap", items: ["Generator rental","Temporary power distribution","UPS systems","Electrical installation","Power monitoring"] },
    { name: "Furniture & Décor", icon: "Armchair", items: ["Furniture rental","Lounge setup","VIP lounges","Conference furniture","Registration desks","Stage furniture","Decorative installations"] },
    { name: "Hospitality Services", icon: "Coffee", items: ["Green room setup","VIP hospitality","Artist hospitality","Backstage management","Catering coordination"] },
    { name: "Event Staffing", icon: "Users", items: ["Production managers","Stage managers","Technical directors","Show callers","Camera operators","Audio engineers","Lighting engineers","Video engineers","LED technicians","Riggers","Stagehands","Ushers","Registration staff","Hostesses","Runners"] },
    { name: "Security Services", icon: "Shield", items: ["Event security","Crowd management","Access control","VIP protection","Emergency response planning"] },
    { name: "Logistics Services", icon: "Truck", items: ["Equipment transportation","Freight forwarding","Customs clearance","Warehouse management","Equipment storage","Delivery coordination"] },
    { name: "Safety & Compliance", icon: "AlertTriangle", items: ["Risk assessments","Method statements","Health & safety plans","Structural engineering","Fire safety compliance","Venue compliance","Permit management"] },
    { name: "Event Marketing Support", icon: "Megaphone", items: ["Event websites","Digital invitations","Email campaigns","Social media campaigns","Sponsor activation","Press conferences","Media management"] },
    { name: "Post-Event Services", icon: "FileText", items: ["Event reporting","Analytics","Attendee feedback","Photo editing","Video editing","Highlight reels","Documentary production","ROI reports","Sponsor reports","Archive management"] },
    { name: "Consultancy & Strategy", icon: "Lightbulb", items: ["Event feasibility studies","Technical consultancy","Venue consultancy","Production audits","Procurement consulting","Event technology consulting","Sustainability consulting","Training and capacity building"] },
  ];

  let totalItems = 0;
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const existing = await db.serviceCategory.findFirst({ where: { name: cat.name } });
    if (!existing) {
      await db.serviceCategory.create({
        data: {
          name: cat.name, icon: cat.icon, sortOrder: i + 1,
          items: { create: cat.items.map(name => ({ name })) },
        },
      });
      totalItems += cat.items.length;
    }
  }
  console.log(`Seeded ${categories.length} service categories with ${totalItems} items`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
