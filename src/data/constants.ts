// Zambian Provinces and Districts
export const PROVINCES: Record<string, { capital: string; districts: string[] }> = {
  "Central Province": {
    capital: "Kabwe",
    districts: ["Chibombo", "Chisamba", "Chitambo", "Itezhi-Tezhi", "Kabwe", "Kapiri Mposhi", "Luano", "Mkushi", "Mumbwa", "Ngabwe", "Serenje"],
  },
  "Copperbelt Province": {
    capital: "Ndola",
    districts: ["Chililabombwe", "Chingola", "Kalulushi", "Kitwe", "Luanshya", "Lufwanyama", "Masaiti", "Mpongwe", "Mufulira", "Ndola"],
  },
  "Eastern Province": {
    capital: "Chipata",
    districts: ["Chadiza", "Chasefu", "Chipangali", "Chipata", "Kasenengwa", "Katete", "Lumezi", "Lundazi", "Lusangazi", "Mambwe", "Nyimba", "Petauke", "Sinda", "Vubwi", "Lumezi New District"],
  },
  "Luapula Province": {
    capital: "Mansa",
    districts: ["Chembe", "Chiengi", "Chifunabuli", "Chipili", "Kawambwa", "Lunga", "Mansa", "Milenge", "Mwansabombwe", "Mwense", "Nchelenge", "Samfya"],
  },
  "Lusaka Province": {
    capital: "Lusaka",
    districts: ["Chilanga", "Chirundu", "Chongwe", "Kafue", "Luangwa", "Lusaka", "Rufunsa", "Shibuyunji"],
  },
  "Muchinga Province": {
    capital: "Chinsali",
    districts: ["Chama", "Chinsali", "Isoka", "Kanchibiya", "Lavushimanda", "Mafinga", "Mpika", "Nakonde", "Shiwang'andu"],
  },
  "Northern Province": {
    capital: "Kasama",
    districts: ["Chilubi", "Kaputa", "Kasama", "Lunte", "Lupososhi", "Luwingu", "Mbala", "Mporokoso", "Mpulungu", "Mungwi", "Nsama", "Senga Hill"],
  },
  "North-Western Province": {
    capital: "Solwezi",
    districts: ["Chavuma", "Ikelenge", "Kabompo", "Kalumbila", "Kasempa", "Manyinga", "Mufumbwe", "Mushindamo", "Mwinilunga", "Solwezi", "Zambezi"],
  },
  "Southern Province": {
    capital: "Choma",
    districts: ["Chikankata", "Choma", "Gwembe", "Kalomo", "Kazungula", "Livingstone", "Mazabuka", "Monze", "Namwala", "Pemba", "Siavonga", "Sinazongwe", "Zimba", "Itezhi-Tezhi", "Kalomo New District"],
  },
  "Western Province": {
    capital: "Mongu",
    districts: ["Kalabo", "Kaoma", "Limulunga", "Luampa", "Lukulu", "Mitete", "Mongu", "Mulobezi", "Mwandi", "Nalolo", "Nkeyema", "Senanga", "Sesheke", "Shangombo", "Sikongo", "Sioma"],
  },
};

// Junior Secondary Subjects (Grade 8-9)
export const JUNIOR_SUBJECTS = [
  "English Language",
  "Mathematics",
  "Integrated Science",
  "Social Studies",
  "Business Studies",
  "Agricultural Science",
  "Computer Studies / ICT",
  "Design & Technology",
  "Art & Design",
  "Musical Arts Education",
  "Physical Education",
  "Religious Education",
  "Home Economics",
  "Zambian Languages",
];

// Senior Secondary Subjects (Grade 10-12)
export const SENIOR_SUBJECTS = [
  "English",
  "Mathematics",
  "Additional Mathematics",
  "Biology",
  "Chemistry",
  "Physics",
  "Geography",
  "History",
  "Civic Education",
  "English Literature",
  "Religious Education RE 2044",
  "Commerce / Principles of Accounts",
  "Business Studies",
  "Economics",
  "Travel & Tourism",
  "Agricultural Science",
  "Art & Design",
  "Computer Science",
  "Design & Technology",
  "Home Economics",
  "Food & Nutrition",
  "Fashion & Fabrics",
  "Hospitality Management",
  "Music",
  "Physical Education",
  "French",
  "Zambian Languages",
];

export const GRADES = ["8A", "8B", "9A", "9B", "10A", "10B", "11A", "11B", "12A", "12B"] as const;
export type Grade = (typeof GRADES)[number];

export const JUNIOR_GRADES: Grade[] = ["8A", "8B", "9A", "9B"];
export const SENIOR_GRADES: Grade[] = ["10A", "10B", "11A", "11B", "12A", "12B"];

export const DEPARTMENTS = [
  "Mathematics",
  "Sciences",
  "Languages",
  "Social Studies",
  "Business Studies",
  "Technical Subjects",
  "Creative Arts",
  "Physical Education",
  "Agriculture",
  "Home Economics",
  "IT Department",
  "Religious Education",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export type Role = "headteacher" | "deputy" | "hod" | "teacher" | "pupil";

// The school logo as base64 will be managed dynamically; we use the provided one.
export const SCHOOL_MOTTO = "RISE & SHINE";
export const SCHOOL_NAME = "YENGWE SECONDARY SCHOOL";
export const SCHOOL_EMAIL = "info@yengwesecondary.edu.zm";

// Performance threshold aligned with Yengwe grading system
// Below credit (<55) = red, Credit/Satisfactory (55-59 and below merit) = yellow, Merit/Distinction (60+) = green
export function getPerformanceColor(avg: number): "red" | "yellow" | "green" {
  if (avg < 40) return "red";      // Grade 9 (Unsatisfactory)
  if (avg < 60) return "yellow";   // Grades 5-8 (Credit / Satisfactory)
  return "green";                  // Grades 1-4 (Distinction / Merit)
}
