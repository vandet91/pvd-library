import { PrismaClient } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();
import bcrypt from "bcryptjs";
import { addDays, subDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // ── Clean existing data ────────────────────────────────────────
  await prisma.fine.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.ebook.deleteMany();
  await prisma.book.deleteMany();
  await prisma.member.deleteMany();
  await prisma.author.deleteMany();
  await prisma.publisher.deleteMany();
  await prisma.category.deleteMany();
  console.log("🗑️  Cleared existing data");

  // ── Admin account ──────────────────────────────────────────────
  const adminPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@pvdlibrary.com" },
    update: {},
    create: { email: "admin@pvdlibrary.com", name: "Admin", password: adminPassword, role: "ADMIN" },
  });
  console.log("✅ Admin account ready");

  // ── Categories ────────────────────────────────────────────────
  const [fiction, science, history, technology, literature, religion, education, health, business, arts] =
    await Promise.all([
      prisma.category.upsert({ where: { name: "Fiction" },      update: {}, create: { name: "Fiction",      nameKm: "រឿងប្រឌិត" } }),
      prisma.category.upsert({ where: { name: "Science" },      update: {}, create: { name: "Science",      nameKm: "វិទ្យាសាស្ត្រ" } }),
      prisma.category.upsert({ where: { name: "History" },      update: {}, create: { name: "History",      nameKm: "ប្រវត្តិសាស្ត្រ" } }),
      prisma.category.upsert({ where: { name: "Technology" },   update: {}, create: { name: "Technology",   nameKm: "បច្ចេកវិទ្យា" } }),
      prisma.category.upsert({ where: { name: "Literature" },   update: {}, create: { name: "Literature",   nameKm: "អក្សរសាស្ត្រ" } }),
      prisma.category.upsert({ where: { name: "Religion" },     update: {}, create: { name: "Religion",     nameKm: "សាសនា" } }),
      prisma.category.upsert({ where: { name: "Education" },    update: {}, create: { name: "Education",    nameKm: "អប់រំ" } }),
      prisma.category.upsert({ where: { name: "Health" },       update: {}, create: { name: "Health",       nameKm: "សុខភាព" } }),
      prisma.category.upsert({ where: { name: "Business" },     update: {}, create: { name: "Business",     nameKm: "ធុរកិច្ច" } }),
      prisma.category.upsert({ where: { name: "Arts & Culture"},update: {}, create: { name: "Arts & Culture",nameKm: "សិល្បៈ និង វប្បធម៌" } }),
    ]);
  console.log("✅ 10 categories created");

  // ── Publishers ────────────────────────────────────────────────
  const [angkorPub, mekongPub, pearsonPub, oreillyPub, cambodiaPub] = await Promise.all([
    prisma.publisher.create({ data: { name: "Angkor Publishing" } }),
    prisma.publisher.create({ data: { name: "Mekong Press" } }),
    prisma.publisher.create({ data: { name: "Pearson Education" } }),
    prisma.publisher.create({ data: { name: "O'Reilly Media" } }),
    prisma.publisher.create({ data: { name: "Cambodia Book House" } }),
  ]);
  console.log("✅ 5 publishers created");

  // ── Authors ───────────────────────────────────────────────────
  const [
    chanSophal, kimSreyNich, davidLim, sarahWong, pemDorji,
    ritaOsei, janeSmith, markTaylor, angHeng, sophiaDuval,
  ] = await Promise.all([
    prisma.author.create({ data: { name: "Chan Sophal" } }),
    prisma.author.create({ data: { name: "Kim Srey Nich" } }),
    prisma.author.create({ data: { name: "David Lim" } }),
    prisma.author.create({ data: { name: "Sarah Wong" } }),
    prisma.author.create({ data: { name: "Pem Dorji" } }),
    prisma.author.create({ data: { name: "Rita Osei" } }),
    prisma.author.create({ data: { name: "Jane Smith" } }),
    prisma.author.create({ data: { name: "Mark Taylor" } }),
    prisma.author.create({ data: { name: "Ang Heng" } }),
    prisma.author.create({ data: { name: "Sophia Duval" } }),
  ]);
  console.log("✅ 10 authors created");

  // ── Books ─────────────────────────────────────────────────────
  const books = await Promise.all([
    // Khmer books
    prisma.book.create({ data: {
      title: "ប្រវត្តិខ្មែរ", titleKm: "ប្រវត្តិខ្មែរ",
      isbn: "978-9-924-00001-1", totalCopies: 5, availableCopies: 5,
      categoryId: history.id, authorId: chanSophal.id, publisherId: angkorPub.id,
      publishYear: 2020, pages: 320, language: "km", location: "A-01",
      description: "ប្រវត្តិរបស់ប្រទេសកម្ពុជាតាំងពីសម័យបុរាណរហូតដល់សម័យទំនើប",
    }}),
    prisma.book.create({ data: {
      title: "ច្បាប់ហិរញ្ញវត្ថុ", titleKm: "ច្បាប់ហិរញ្ញវត្ថុ",
      isbn: "978-9-924-00002-2", totalCopies: 3, availableCopies: 3,
      categoryId: business.id, authorId: kimSreyNich.id, publisherId: cambodiaPub.id,
      publishYear: 2021, pages: 210, language: "km", location: "B-05",
      description: "មគ្គុទ្ទេសក៍ស្តីពីច្បាប់ហិរញ្ញវត្ថុ និងការគ្រប់គ្រងថវិកា",
    }}),
    prisma.book.create({ data: {
      title: "ការថែទាំសុខភាព", titleKm: "ការថែទាំសុខភាព",
      isbn: "978-9-924-00003-3", totalCopies: 4, availableCopies: 4,
      categoryId: health.id, authorId: angHeng.id, publisherId: mekongPub.id,
      publishYear: 2022, pages: 180, language: "km", location: "C-03",
      description: "មគ្គុទ្ទេសក៍ស្តីពីការថែទាំសុខភាពប្រចាំថ្ងៃ",
    }}),
    prisma.book.create({ data: {
      title: "វប្បធម៌ខ្មែរ", titleKm: "វប្បធម៌ខ្មែរ",
      isbn: "978-9-924-00004-4", totalCopies: 6, availableCopies: 6,
      categoryId: arts.id, authorId: chanSophal.id, publisherId: angkorPub.id,
      publishYear: 2019, pages: 260, language: "km", location: "A-02",
      description: "ការស្ទង់ស្វែងយល់អំពីវប្បធម៌ និងប្រពៃណីរបស់ជនជាតិខ្មែរ",
    }}),
    prisma.book.create({ data: {
      title: "ការអប់រំនៅកម្ពុជា", titleKm: "ការអប់រំនៅកម្ពុជា",
      isbn: "978-9-924-00005-5", totalCopies: 4, availableCopies: 4,
      categoryId: education.id, authorId: kimSreyNich.id, publisherId: cambodiaPub.id,
      publishYear: 2023, pages: 195, language: "km", location: "D-01",
      description: "ការវិភាគអំពីប្រព័ន្ធអប់រំ និងការអភិវឌ្ឍការអប់រំនៅកម្ពុជា",
    }}),

    // English books
    prisma.book.create({ data: {
      title: "Clean Code", titleKm: "កូដស្អាត",
      isbn: "978-0-13-235088-4", totalCopies: 4, availableCopies: 4,
      categoryId: technology.id, authorId: davidLim.id, publisherId: oreillyPub.id,
      publishYear: 2008, pages: 431, language: "en", location: "E-01",
      description: "A handbook of agile software craftsmanship for writing readable, maintainable code.",
    }}),
    prisma.book.create({ data: {
      title: "The Great Gatsby",
      isbn: "978-0-7432-7356-5", totalCopies: 5, availableCopies: 5,
      categoryId: fiction.id, authorId: sarahWong.id, publisherId: pearsonPub.id,
      publishYear: 1925, pages: 180, language: "en", location: "F-02",
      description: "A story of wealth, love, and the American Dream in the 1920s.",
    }}),
    prisma.book.create({ data: {
      title: "A Brief History of Time",
      isbn: "978-0-553-38016-3", totalCopies: 3, availableCopies: 3,
      categoryId: science.id, authorId: markTaylor.id, publisherId: pearsonPub.id,
      publishYear: 1988, pages: 212, language: "en", location: "G-01",
      description: "Stephen Hawking's accessible exploration of cosmology and the universe.",
    }}),
    prisma.book.create({ data: {
      title: "Python for Data Science",
      isbn: "978-1-491-91205-8", totalCopies: 6, availableCopies: 6,
      categoryId: technology.id, authorId: janeSmith.id, publisherId: oreillyPub.id,
      publishYear: 2022, pages: 548, language: "en", location: "E-02",
      description: "Hands-on guide to data analysis, visualization, and machine learning with Python.",
    }}),
    prisma.book.create({ data: {
      title: "World War II: A History",
      isbn: "978-0-14-303533-0", totalCopies: 3, availableCopies: 3,
      categoryId: history.id, authorId: ritaOsei.id, publisherId: pearsonPub.id,
      publishYear: 2015, pages: 420, language: "en", location: "H-03",
      description: "A comprehensive account of the causes, battles, and consequences of World War II.",
    }}),
    prisma.book.create({ data: {
      title: "The Power of Habit",
      isbn: "978-0-8129-8160-5", totalCopies: 4, availableCopies: 4,
      categoryId: health.id, authorId: sophiaDuval.id, publisherId: pearsonPub.id,
      publishYear: 2012, pages: 371, language: "en", location: "C-04",
      description: "Why we do what we do in life and business — the science of habit formation.",
    }}),
    prisma.book.create({ data: {
      title: "Introduction to Algorithms",
      isbn: "978-0-26-204630-5", totalCopies: 3, availableCopies: 3,
      categoryId: technology.id, authorId: davidLim.id, publisherId: oreillyPub.id,
      publishYear: 2009, pages: 1312, language: "en", location: "E-03",
      description: "The definitive textbook on algorithms, used in universities worldwide.",
    }}),
    prisma.book.create({ data: {
      title: "Buddhism in Southeast Asia",
      isbn: "978-9-924-00010-3", totalCopies: 4, availableCopies: 4,
      categoryId: religion.id, authorId: pemDorji.id, publisherId: mekongPub.id,
      publishYear: 2018, pages: 290, language: "en", location: "I-01",
      description: "An exploration of Theravada Buddhism and its influence in Southeast Asian societies.",
    }}),
    prisma.book.create({ data: {
      title: "Marketing Fundamentals",
      isbn: "978-0-13-385233-1", totalCopies: 5, availableCopies: 5,
      categoryId: business.id, authorId: janeSmith.id, publisherId: pearsonPub.id,
      publishYear: 2020, pages: 340, language: "en", location: "B-06",
      description: "Core concepts of marketing strategy, consumer behaviour, and brand management.",
    }}),
    prisma.book.create({ data: {
      title: "To Kill a Mockingbird",
      isbn: "978-0-06-112008-4", totalCopies: 4, availableCopies: 4,
      categoryId: literature.id, authorId: sarahWong.id, publisherId: pearsonPub.id,
      publishYear: 1960, pages: 281, language: "en", location: "F-03",
      description: "Harper Lee's Pulitzer Prize-winning masterwork of honor and injustice in the American South.",
    }}),
  ]);
  console.log(`✅ ${books.length} books created`);

  // ── Ebooks ────────────────────────────────────────────────────
  const ebookData = [
    // PDF
    {
      title: "Introduction to Web Development",
      titleKm: "សេចក្តីផ្តើមអំពីការអភិវឌ្ឍន៍វេបសាយ",
      ebookType: "PDF" as const,
      fileUrl: "https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF1",
      coverImage: "",
      description: "A beginner's guide to HTML, CSS, and JavaScript for web development.",
      language: "en", publishYear: 2023,
      categoryId: technology.id, authorId: davidLim.id,
    },
    {
      title: "ភាសាខ្មែរ — មូលដ្ឋានគ្រឹះ",
      titleKm: "ភាសាខ្មែរ — មូលដ្ឋានគ្រឹះ",
      ebookType: "PDF" as const,
      fileUrl: "https://www.omniglot.com/pdfs/khmer_language.pdf",
      coverImage: "",
      description: "មូលដ្ឋានគ្រឹះនៃភាសា និងអក្ខរាវិរុទ្ធខ្មែរ",
      language: "km", publishYear: 2020,
      categoryId: education.id, authorId: chanSophal.id,
    },
    {
      title: "Free Science Textbook — Physics",
      ebookType: "PDF" as const,
      fileUrl: "https://openstax.org/books/university-physics-volume-1/pages/1-introduction",
      coverImage: "",
      description: "Open-source university physics textbook from OpenStax.",
      language: "en", publishYear: 2022,
      categoryId: science.id, authorId: markTaylor.id,
    },
    // EPUB
    {
      title: "Alice's Adventures in Wonderland",
      ebookType: "EPUB" as const,
      fileUrl: "https://www.gutenberg.org/ebooks/11.epub.images",
      coverImage: "",
      description: "Lewis Carroll's classic fantasy novel, free from Project Gutenberg.",
      language: "en", publishYear: 1865,
      categoryId: fiction.id, authorId: sarahWong.id,
    },
    {
      title: "Pride and Prejudice",
      ebookType: "EPUB" as const,
      fileUrl: "https://www.gutenberg.org/ebooks/1342.epub.images",
      coverImage: "",
      description: "Jane Austen's beloved novel, free from Project Gutenberg.",
      language: "en", publishYear: 1813,
      categoryId: literature.id, authorId: sarahWong.id,
    },
    // VIDEO
    {
      title: "Learn JavaScript in 1 Hour",
      titleKm: "រៀន JavaScript ក្នុង ១ ម៉ោង",
      ebookType: "VIDEO" as const,
      fileUrl: "https://www.youtube.com/watch?v=W6NZfCO5SIk",
      coverImage: "",
      description: "A fast-paced beginner JavaScript tutorial on YouTube.",
      language: "en", publishYear: 2023,
      categoryId: technology.id, authorId: davidLim.id,
    },
    {
      title: "ការបង្រៀនព្រះពុទ្ធសាសនា",
      titleKm: "ការបង្រៀនព្រះពុទ្ធសាសនា",
      ebookType: "VIDEO" as const,
      fileUrl: "https://www.youtube.com/watch?v=8Nn5uqE3C9w",
      coverImage: "",
      description: "វីដេអូបង្រៀនអំពីព្រះពុទ្ធសាសនា Theravada",
      language: "km", publishYear: 2022,
      categoryId: religion.id, authorId: pemDorji.id,
    },
    // AUDIO
    {
      title: "English Pronunciation Practice",
      titleKm: "ការហាត់អានអង់គ្លេស",
      ebookType: "AUDIO" as const,
      fileUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      coverImage: "",
      description: "Audio lessons for improving English pronunciation and listening skills.",
      language: "en", publishYear: 2023,
      categoryId: education.id, authorId: janeSmith.id,
    },
    {
      title: "Khmer Traditional Music Collection",
      titleKm: "បទចម្រៀងប្រពៃណីខ្មែរ",
      ebookType: "AUDIO" as const,
      fileUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      coverImage: "",
      description: "A curated collection of traditional Khmer music and folk songs.",
      language: "km", publishYear: 2021,
      categoryId: arts.id, authorId: angHeng.id,
    },
    // EXTERNAL LINK
    {
      title: "National Library of Cambodia",
      titleKm: "បណ្ណាល័យជាតិកម្ពុជា",
      ebookType: "LINK" as const,
      fileUrl: "https://www.nationallibrarycambodia.gov.kh",
      coverImage: "",
      description: "Online portal of the National Library of Cambodia with digital resources.",
      language: "km", publishYear: 2023,
      categoryId: education.id, authorId: chanSophal.id,
    },
    {
      title: "Khan Academy — Free Courses",
      titleKm: "Khan Academy — មេរៀនឥតគិតថ្លៃ",
      ebookType: "LINK" as const,
      fileUrl: "https://www.khanacademy.org",
      coverImage: "",
      description: "Free world-class education for anyone, anywhere — math, science, history and more.",
      language: "en", publishYear: 2023,
      categoryId: education.id, authorId: janeSmith.id,
    },
  ];

  await Promise.all(
    ebookData.map((eb) =>
      prisma.ebook.create({ data: { ...eb, isPublic: true, views: Math.floor(Math.random() * 120) } })
    )
  );
  console.log(`✅ ${ebookData.length} ebooks created (PDF×3, EPUB×2, Video×2, Audio×2, Link×2)`);

  // ── Members ───────────────────────────────────────────────────
  const memberData = [
    { memberId: "MEM-2024-0001", name: "Sok Dara",        email: "sokdara@student.edu.kh",    phone: "012-345-678", memberType: "STUDENT" as const, address: "Phnom Penh" },
    { memberId: "MEM-2024-0002", name: "Chea Sreyleak",   email: "sreyleak@student.edu.kh",   phone: "017-234-567", memberType: "STUDENT" as const, address: "Siem Reap" },
    { memberId: "MEM-2024-0003", name: "Pich Rotana",     email: "rotana@student.edu.kh",     phone: "096-123-456", memberType: "STUDENT" as const, address: "Kampot" },
    { memberId: "MEM-2024-0004", name: "Meas Vichet",     email: "vichet@student.edu.kh",     phone: "011-456-789", memberType: "STUDENT" as const, address: "Phnom Penh" },
    { memberId: "MEM-2024-0005", name: "Heng Sokunthea",  email: "sokunthea@student.edu.kh",  phone: "078-789-012", memberType: "STUDENT" as const, address: "Battambang" },
    { memberId: "MEM-2024-0006", name: "Ly Chanpiseth",   email: "chanpiseth@student.edu.kh", phone: "069-567-890", memberType: "STUDENT" as const, address: "Phnom Penh" },
    { memberId: "MEM-2024-0007", name: "Noun Kosal",      email: "kosal@student.edu.kh",      phone: "088-901-234", memberType: "STUDENT" as const, address: "Kandal" },
    { memberId: "MEM-2024-0008", name: "Seng Bopha",      email: "bopha@student.edu.kh",      phone: "015-345-678", memberType: "STUDENT" as const, address: "Prey Veng" },
    { memberId: "MEM-2024-0009", name: "Prof. Khem Vanna",email: "khemvanna@school.edu.kh",   phone: "012-678-901", memberType: "TEACHER" as const, address: "Phnom Penh" },
    { memberId: "MEM-2024-0010", name: "Dr. Ros Chanthy", email: "chanthy@school.edu.kh",     phone: "017-890-123", memberType: "TEACHER" as const, address: "Phnom Penh" },
    { memberId: "MEM-2024-0011", name: "Theng Pisey",     email: "pisey@school.edu.kh",       phone: "096-234-567", memberType: "TEACHER" as const, address: "Siem Reap" },
    { memberId: "MEM-2024-0012", name: "Yim Sopheak",     email: "sopheak@library.gov.kh",    phone: "011-567-890", memberType: "STAFF"   as const, address: "Phnom Penh" },
    { memberId: "MEM-2024-0013", name: "Chhun Bunleng",   email: "bunleng@library.gov.kh",    phone: "078-012-345", memberType: "STAFF"   as const, address: "Phnom Penh" },
    { memberId: "MEM-2024-0014", name: "Phan Ratanak",    email: "ratanak@gmail.com",          phone: "069-456-789", memberType: "PUBLIC"  as const, address: "Kampong Cham" },
    { memberId: "MEM-2024-0015", name: "Ouk Sreymom",     email: "sreymom@gmail.com",          phone: "088-234-567", memberType: "PUBLIC"  as const, address: "Phnom Penh" },
  ];

  const members = await Promise.all(
    memberData.map((m) =>
      prisma.member.upsert({
        where: { memberId: m.memberId },
        update: {},
        create: {
          ...m,
          joinDate: subDays(new Date(), Math.floor(Math.random() * 365)),
          expireDate: addDays(new Date(), 365),
          isActive: true,
        },
      })
    )
  );
  console.log(`✅ ${members.length} members created`);

  // ── Loans ─────────────────────────────────────────────────────
  // Active loans
  const activeLoans = [
    { member: members[0],  book: books[5],  borrowedDaysAgo: 3,  dueDays: 14 },
    { member: members[1],  book: books[6],  borrowedDaysAgo: 7,  dueDays: 14 },
    { member: members[2],  book: books[0],  borrowedDaysAgo: 2,  dueDays: 14 },
    { member: members[3],  book: books[8],  borrowedDaysAgo: 5,  dueDays: 14 },
    { member: members[4],  book: books[1],  borrowedDaysAgo: 10, dueDays: 14 },
    { member: members[8],  book: books[11], borrowedDaysAgo: 4,  dueDays: 21 },
    { member: members[9],  book: books[12], borrowedDaysAgo: 6,  dueDays: 21 },
  ];

  for (const { member, book, borrowedDaysAgo, dueDays } of activeLoans) {
    const borrowDate = subDays(new Date(), borrowedDaysAgo);
    const dueDate = addDays(borrowDate, dueDays);
    await prisma.loan.create({
      data: { memberId: member.id, bookId: book.id, borrowDate, dueDate, status: "ACTIVE" },
    });
    await prisma.book.update({ where: { id: book.id }, data: { availableCopies: { decrement: 1 } } });
  }

  // Overdue loans (due in the past, not returned)
  const overdueLoans = [
    { member: members[5],  book: books[7],  borrowedDaysAgo: 25, dueDays: 14 },
    { member: members[6],  book: books[9],  borrowedDaysAgo: 20, dueDays: 14 },
    { member: members[7],  book: books[10], borrowedDaysAgo: 18, dueDays: 14 },
  ];

  for (const { member, book, borrowedDaysAgo, dueDays } of overdueLoans) {
    const borrowDate = subDays(new Date(), borrowedDaysAgo);
    const dueDate = addDays(borrowDate, dueDays);
    const loan = await prisma.loan.create({
      data: { memberId: member.id, bookId: book.id, borrowDate, dueDate, status: "OVERDUE" },
    });
    await prisma.book.update({ where: { id: book.id }, data: { availableCopies: { decrement: 1 } } });

    // Create fine for each overdue
    const today = new Date();
    const daysLate = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    await prisma.fine.create({
      data: { loanId: loan.id, memberId: member.id, daysLate, amount: daysLate * 0.25, status: "UNPAID" },
    });
  }

  // Returned loans (historical)
  const returnedLoans = [
    { member: members[10], book: books[2],  borrowedDaysAgo: 40, dueDays: 14, returnedDaysAgo: 22 },
    { member: members[11], book: books[3],  borrowedDaysAgo: 35, dueDays: 14, returnedDaysAgo: 20 },
    { member: members[12], book: books[4],  borrowedDaysAgo: 30, dueDays: 14, returnedDaysAgo: 16 },
    { member: members[13], book: books[13], borrowedDaysAgo: 50, dueDays: 14, returnedDaysAgo: 33 },
    { member: members[14], book: books[14], borrowedDaysAgo: 45, dueDays: 14, returnedDaysAgo: 29 },
    { member: members[0],  book: books[6],  borrowedDaysAgo: 60, dueDays: 14, returnedDaysAgo: 46 },
    { member: members[1],  book: books[8],  borrowedDaysAgo: 55, dueDays: 14, returnedDaysAgo: 42, wasLate: true },
    { member: members[2],  book: books[5],  borrowedDaysAgo: 70, dueDays: 14, returnedDaysAgo: 50 },
    { member: members[3],  book: books[0],  borrowedDaysAgo: 90, dueDays: 14, returnedDaysAgo: 70 },
    { member: members[8],  book: books[7],  borrowedDaysAgo: 80, dueDays: 21, returnedDaysAgo: 55 },
  ];

  for (const { member, book, borrowedDaysAgo, dueDays, returnedDaysAgo, wasLate } of returnedLoans) {
    const borrowDate  = subDays(new Date(), borrowedDaysAgo);
    const dueDate     = addDays(borrowDate, dueDays);
    const returnDate  = subDays(new Date(), returnedDaysAgo);
    const loan = await prisma.loan.create({
      data: { memberId: member.id, bookId: book.id, borrowDate, dueDate, returnDate, status: "RETURNED" },
    });

    // Add paid fine for one late return
    if (wasLate) {
      const daysLate = Math.max(0, Math.ceil((returnDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      if (daysLate > 0) {
        await prisma.fine.create({
          data: {
            loanId: loan.id, memberId: member.id,
            daysLate, amount: daysLate * 0.25,
            status: "PAID", paidAt: subDays(new Date(), returnedDaysAgo - 2),
          },
        });
      }
    }
  }

  console.log(`✅ ${activeLoans.length} active loans, ${overdueLoans.length} overdue, ${returnedLoans.length} returned`);
  console.log(`✅ Fines generated for overdue & late returns`);

  console.log("\n─────────────────────────────────────────");
  console.log("🎉 Seed complete!");
  console.log("   Admin login : admin@pvdlibrary.com");
  console.log("   Password    : admin123");
  console.log("   URL         : http://localhost:3000/en/admin");
  console.log("─────────────────────────────────────────");
}

main().catch(console.error).finally(() => prisma.$disconnect());
