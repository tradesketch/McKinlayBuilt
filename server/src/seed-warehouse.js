const { getDb } = require('./database');

const db = getDb();

const items = [
  // Ironmongery > Door Handles
  { name: 'Lever on Rose (Contemporary)', category: 'Ironmongery', subcategory: 'Door Handles', tags: 'lever,contemporary,modern', type: 'parametric', parameters: '{"style":"lever","backplate":"rose","finish":"chrome"}' },
  { name: 'Lever on Backplate (Traditional)', category: 'Ironmongery', subcategory: 'Door Handles', tags: 'lever,traditional,period', type: 'parametric', parameters: '{"style":"lever","backplate":"plate","finish":"brass"}' },
  { name: 'Round Door Knob', category: 'Ironmongery', subcategory: 'Door Handles', tags: 'knob,round,classic', type: 'parametric', parameters: '{"style":"knob","shape":"round","finish":"chrome"}' },
  { name: 'Pull Handle Bar', category: 'Ironmongery', subcategory: 'Door Handles', tags: 'pull,bar,contemporary', type: 'parametric', parameters: '{"style":"pull","length":300,"finish":"stainless"}' },

  // Ironmongery > Cabinet Hardware
  { name: 'Cup Handle', category: 'Ironmongery', subcategory: 'Cabinet Hardware', tags: 'cup,shaker,kitchen', type: 'parametric', parameters: '{"style":"cup","width":96}' },
  { name: 'T-Bar Pull', category: 'Ironmongery', subcategory: 'Cabinet Hardware', tags: 'tbar,modern,minimal', type: 'parametric', parameters: '{"style":"tbar","length":128}' },
  { name: 'Knob (Round)', category: 'Ironmongery', subcategory: 'Cabinet Hardware', tags: 'knob,round,cabinet', type: 'parametric', parameters: '{"style":"knob","diameter":32}' },
  { name: 'Edge Pull', category: 'Ironmongery', subcategory: 'Cabinet Hardware', tags: 'edge,recessed,handleless', type: 'parametric', parameters: '{"style":"edge","length":150}' },

  // Ironmongery > Hinges
  { name: 'Butt Hinge (76mm)', category: 'Ironmongery', subcategory: 'Hinges', tags: 'butt,door,standard', type: 'parametric', parameters: '{"type":"butt","size":76}' },
  { name: 'Parliament Hinge', category: 'Ironmongery', subcategory: 'Hinges', tags: 'parliament,wide,period', type: 'parametric', parameters: '{"type":"parliament","size":100}' },
  { name: 'Concealed Cabinet Hinge', category: 'Ironmongery', subcategory: 'Hinges', tags: 'concealed,cabinet,soft-close', type: 'parametric', parameters: '{"type":"concealed","overlay":"full"}' },

  // Ironmongery > Locks
  { name: 'Mortice Lock (Sashlock)', category: 'Ironmongery', subcategory: 'Locks', tags: 'mortice,sash,lock', type: 'parametric', parameters: '{"type":"sashlock","backset":57}' },
  { name: 'Deadlock', category: 'Ironmongery', subcategory: 'Locks', tags: 'dead,security,lock', type: 'parametric', parameters: '{"type":"deadlock","backset":57}' },
  { name: 'Letterbox Plate', category: 'Ironmongery', subcategory: 'Locks', tags: 'letterbox,post,external', type: 'parametric', parameters: '{"width":260,"height":45}' },

  // Appliances > Ovens
  { name: 'Single Built-in Oven', category: 'Appliances', subcategory: 'Ovens', tags: 'single,built-in,600mm', type: 'catalogue', parameters: '{"width":600,"height":595}' },
  { name: 'Double Built-in Oven', category: 'Appliances', subcategory: 'Ovens', tags: 'double,built-in,600mm', type: 'catalogue', parameters: '{"width":600,"height":888}' },
  { name: 'Range Cooker (900mm)', category: 'Appliances', subcategory: 'Ovens', tags: 'range,freestanding,900mm', type: 'catalogue', parameters: '{"width":900,"height":900}' },

  // Appliances > Hobs
  { name: 'Gas Hob (5 Burner)', category: 'Appliances', subcategory: 'Hobs', tags: 'gas,5-burner,700mm', type: 'catalogue', parameters: '{"width":700,"burners":5}' },
  { name: 'Induction Hob (4 Zone)', category: 'Appliances', subcategory: 'Hobs', tags: 'induction,4-zone,600mm', type: 'catalogue', parameters: '{"width":600,"zones":4}' },

  // Appliances > Sinks
  { name: 'Belfast Sink', category: 'Appliances', subcategory: 'Sinks', tags: 'belfast,ceramic,600mm', type: 'catalogue', parameters: '{"width":600,"depth":250,"style":"belfast"}' },
  { name: 'Undermount Sink (1.5 Bowl)', category: 'Appliances', subcategory: 'Sinks', tags: 'undermount,stainless,1.5-bowl', type: 'catalogue', parameters: '{"width":600,"bowls":1.5}' },

  // Appliances > Taps
  { name: 'Mono Mixer Tap', category: 'Appliances', subcategory: 'Taps', tags: 'mono,mixer,chrome', type: 'catalogue', parameters: '{"style":"mono","finish":"chrome"}' },
  { name: 'Bridge Tap (Traditional)', category: 'Appliances', subcategory: 'Taps', tags: 'bridge,traditional,crosshead', type: 'catalogue', parameters: '{"style":"bridge","finish":"chrome"}' },

  // Appliances > Extractors
  { name: 'Chimney Hood (600mm)', category: 'Appliances', subcategory: 'Extractors', tags: 'chimney,hood,600mm', type: 'catalogue', parameters: '{"width":600,"style":"chimney"}' },
  { name: 'Island Hood (900mm)', category: 'Appliances', subcategory: 'Extractors', tags: 'island,ceiling,900mm', type: 'catalogue', parameters: '{"width":900,"style":"island"}' },

  // Sanitary > Basins
  { name: 'Countertop Basin', category: 'Sanitary', subcategory: 'Basins', tags: 'countertop,round,modern', type: 'catalogue', parameters: '{"style":"countertop","diameter":400}' },
  { name: 'Wall-Hung Basin', category: 'Sanitary', subcategory: 'Basins', tags: 'wall-hung,modern,compact', type: 'catalogue', parameters: '{"style":"wall-hung","width":550}' },

  // Sanitary > Baths
  { name: 'Freestanding Bath', category: 'Sanitary', subcategory: 'Baths', tags: 'freestanding,slipper,modern', type: 'catalogue', parameters: '{"style":"freestanding","length":1700}' },
  { name: 'Built-In Bath', category: 'Sanitary', subcategory: 'Baths', tags: 'built-in,standard,1700mm', type: 'catalogue', parameters: '{"style":"built-in","length":1700}' },

  // Sanitary > Toilets
  { name: 'Close-Coupled WC', category: 'Sanitary', subcategory: 'Toilets', tags: 'close-coupled,standard', type: 'catalogue', parameters: '{"style":"close-coupled"}' },
  { name: 'Wall-Hung WC', category: 'Sanitary', subcategory: 'Toilets', tags: 'wall-hung,concealed-cistern', type: 'catalogue', parameters: '{"style":"wall-hung"}' },

  // Furniture > Seating
  { name: 'Sofa (3 Seater)', category: 'Furniture', subcategory: 'Seating', tags: 'sofa,3-seater,living', type: 'catalogue', parameters: '{"width":2100,"depth":900}' },
  { name: 'Armchair', category: 'Furniture', subcategory: 'Seating', tags: 'armchair,accent,living', type: 'catalogue', parameters: '{"width":800,"depth":850}' },
  { name: 'Dining Chair', category: 'Furniture', subcategory: 'Seating', tags: 'dining,chair,wooden', type: 'catalogue', parameters: '{"width":450,"depth":500}' },

  // Furniture > Tables
  { name: 'Dining Table (6 Seater)', category: 'Furniture', subcategory: 'Tables', tags: 'dining,6-seater,rectangular', type: 'catalogue', parameters: '{"width":1800,"depth":900}' },
  { name: 'Coffee Table', category: 'Furniture', subcategory: 'Tables', tags: 'coffee,living,low', type: 'catalogue', parameters: '{"width":1200,"depth":600}' },

  // Fixtures > Lighting
  { name: 'Pendant Light', category: 'Fixtures', subcategory: 'Lighting', tags: 'pendant,ceiling,decorative', type: 'catalogue', parameters: '{"style":"pendant","diameter":300}' },
  { name: 'Downlight (LED)', category: 'Fixtures', subcategory: 'Lighting', tags: 'downlight,recessed,LED', type: 'catalogue', parameters: '{"style":"downlight","diameter":85}' },
  { name: 'Wall Sconce', category: 'Fixtures', subcategory: 'Lighting', tags: 'wall,sconce,decorative', type: 'catalogue', parameters: '{"style":"wall","width":150}' },

  // Fixtures > Radiators
  { name: 'Column Radiator (2 Column)', category: 'Fixtures', subcategory: 'Radiators', tags: 'column,traditional,cast-iron', type: 'catalogue', parameters: '{"columns":2,"height":600,"sections":10}' },
  { name: 'Panel Radiator (Type 21)', category: 'Fixtures', subcategory: 'Radiators', tags: 'panel,modern,compact', type: 'catalogue', parameters: '{"type":"21","height":600,"width":1000}' },

  // Exterior > Roofing
  { name: 'Slate Roof Tile', category: 'Exterior', subcategory: 'Roofing', tags: 'slate,natural,grey', type: 'catalogue', parameters: '{"material":"slate","size":"500x250"}' },
  { name: 'Concrete Roof Tile', category: 'Exterior', subcategory: 'Roofing', tags: 'concrete,interlocking', type: 'catalogue', parameters: '{"material":"concrete","profile":"interlocking"}' },

  // Exterior > Brickwork
  { name: 'Flemish Bond Brick', category: 'Exterior', subcategory: 'Brickwork', tags: 'flemish,bond,red', type: 'catalogue', parameters: '{"bond":"flemish","colour":"red"}' },
  { name: 'Stretcher Bond Brick', category: 'Exterior', subcategory: 'Brickwork', tags: 'stretcher,bond,standard', type: 'catalogue', parameters: '{"bond":"stretcher","colour":"buff"}' },

  // Exterior > Cladding
  { name: 'Timber Cladding (Larch)', category: 'Exterior', subcategory: 'Cladding', tags: 'timber,larch,horizontal', type: 'catalogue', parameters: '{"material":"larch","orientation":"horizontal"}' },
  { name: 'Composite Cladding', category: 'Exterior', subcategory: 'Cladding', tags: 'composite,low-maintenance', type: 'catalogue', parameters: '{"material":"composite","orientation":"horizontal"}' },
];

// Clear and re-seed
db.prepare('DELETE FROM warehouse_items').run();

const insert = db.prepare(
  `INSERT INTO warehouse_items (name, category, subcategory, tags, description, type, parameters) VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const tx = db.transaction(() => {
  for (const item of items) {
    insert.run(item.name, item.category, item.subcategory, item.tags, item.description || null, item.type, item.parameters || null);
  }
});

tx();
console.log(`Seeded ${items.length} warehouse items`);
