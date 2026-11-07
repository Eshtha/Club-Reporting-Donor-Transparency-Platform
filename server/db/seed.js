import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const { Pool } = pg; const pool = new Pool({connectionString:process.env.DATABASE_URL});
try {
 const name=process.env.ADMIN_NAME||'WWCB Platform Admin'; const email=(process.env.ADMIN_EMAIL||'admin@wwcb.local').toLowerCase(); const password=process.env.ADMIN_PASSWORD;
 if(!password || password.length<12) throw new Error('Set ADMIN_PASSWORD (minimum 12 characters) in .env before seeding.');
 const hash=await bcrypt.hash(password,12);
 await pool.query(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin') ON CONFLICT(email) DO NOTHING`,[name,email,hash]);
 const content={
  'brand':{clubName:'Rotaract Club of World Without Childhood Blindness',shortName:'Rotaract WWCB',tagline:'Every Contribution Deserves Transparency',heroTitle:'See beyond vision. See possibility.',heroText:'Building a world where every child has the opportunity to see, learn and thrive. Explore our work, meet our community and follow the journey of every contribution.',email:'hello@rotaract-wwcb.org',instagram:'https://www.instagram.com/rotaractclub_wwcb/',linkedin:'https://www.linkedin.com/company/rotaract-club-of-world-without-childhood-blindness/',x:'https://twitter.com/Rotaract_WWCB'},
  'facts':[{value:'280,000+',label:'Blind children in India',note:'Partner-reported context'},{value:'85%',label:'Preventable or treatable',note:'Childhood blindness estimate'},{value:'$118B',label:'Economic impact cited',note:'As stated on the existing club website'},{value:'50 yrs',label:'Eye-care experience',note:'Partner-reported history'}],
  'partnerships':[{name:'Eye Foundation of America',description:'Partner supporting the vision of a world without childhood blindness.'},{name:'Goutami Eye Institute',description:'Clinical partner supporting eye screening and treatment in India.'}],
  'ripple':['Vision enables learning','Children stay in school','Adults remain productive','Families escape poverty','Communities grow stronger','Nations gain economically'],
  'programmes':[{name:'Project Drishti',category:'Eye health',description:'Promoting awareness, early screening and access to eye-care support for children and communities.',status:'Featured'},{name:'Project Choti Khushiyan',category:'Community care',description:'Creating thoughtful moments of care, dignity and joy for children.',status:'Community'},{name:'Ahaardaan',category:'Community support',description:'Supporting community wellbeing through food and essential-resource initiatives.',status:'Community'},{name:'Lexaid',category:'Access & awareness',description:'Connecting people with information, support and community resources.',status:'Community'}],
  'leadership':[], 'stories':[], 'partners':[], 'gallery':[], 'impact':{childrenReached:null,eventsHeld:null,volunteers:null,note:'Impact figures will be published only after verification by the club.'}
 };
 for(const [key,value] of Object.entries(content)) await pool.query(`INSERT INTO site_content(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING`,[key,JSON.stringify(value)]);
 console.log(`Admin seed checked for ${email}. Default public content added if missing.`);
} catch(e){console.error(e.message);process.exitCode=1;} finally{await pool.end();}
