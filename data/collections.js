// Ready-made sets of leaders. Each collection is defined by tags, so it fills itself
// as leaders are added to the repository.
//
//   id        url-safe, unique
//   title     shown on the card and page
//   when      short label for the month(s), or "" for topic sets
//   windows   [["MM-DD", "MM-DD"], ...] dates when it's featured as "This month"
//   intro     one or two sentences for the collection page
//   match     any:  has at least one of these tags
//             all:  has every one of these tags
//             bornFrom: born in or after this year
window.LLM_COLLECTIONS = [
  {
    id: "black-history", title: "Black History Month", when: "February",
    windows: [["02-01", "02-29"]],
    intro: "Black leaders in science, the arts, sports, law and the fight for civil rights.",
    match: { any: ["black"] }
  },
  {
    id: "womens-history", title: "Women's History Month", when: "March",
    windows: [["03-01", "03-31"]],
    intro: "Women who changed science, politics, sports, the arts and more.",
    match: { any: ["women"] }
  },
  {
    id: "mena-heritage", title: "MENA Heritage", when: "April",
    windows: [["04-01", "04-30"]],
    intro: "Leaders with roots in the Middle East and North Africa. April is National Arab American Heritage Month.",
    match: { any: ["mena"] }
  },
  {
    id: "neurodiversity", title: "Neurodiversity", when: "April",
    windows: [["04-01", "04-30"]],
    intro: "Leaders who are autistic, have ADHD or dyslexia, or think differently in other ways. April is Autism Acceptance Month.",
    match: { any: ["neurodivergent"] }
  },
  {
    id: "aapi-heritage", title: "AAPI Heritage Month", when: "May",
    windows: [["05-01", "05-31"]],
    intro: "Asian American, Asian and Pacific Islander leaders.",
    match: { any: ["aapi"] }
  },
  {
    id: "lgbtq", title: "LGBTQ+ Pride & History", when: "June and October",
    windows: [["06-01", "06-30"], ["10-01", "10-31"]],
    intro: "LGBTQ+ leaders past and present. June is Pride Month and October is LGBTQ+ History Month.",
    match: { any: ["lgbtq", "transgender", "nonbinary"] }
  },
  {
    id: "immigrant-heritage", title: "Immigrant Heritage Month", when: "June",
    windows: [["06-01", "06-30"]],
    intro: "Leaders who moved to a new country and made their mark there.",
    match: { any: ["immigrant"] }
  },
  {
    id: "disability-pride", title: "Disability Pride Month", when: "July",
    windows: [["07-01", "07-31"]],
    intro: "Disabled leaders in every field. July marks the anniversary of the Americans with Disabilities Act.",
    match: { any: ["disabled"] }
  },
  {
    id: "hispanic-heritage", title: "Hispanic Heritage Month", when: "September 15 – October 15",
    windows: [["09-15", "10-15"]],
    intro: "Latine and Hispanic leaders in science, the arts, sports, law and activism.",
    match: { any: ["latine"] }
  },
  {
    id: "dwarfism-awareness", title: "Dwarfism Awareness Month", when: "October",
    windows: [["10-01", "10-31"]],
    intro: "Little people who are doctors, athletes, actors and advocates.",
    match: { any: ["little-people"] }
  },
  {
    id: "native-american-heritage", title: "Native American Heritage Month", when: "November",
    windows: [["11-01", "11-30"]],
    intro: "Indigenous leaders, including Native Hawaiian leaders, in science, sports, the arts and government.",
    match: { any: ["indigenous"] }
  },

  {
    id: "women-in-stem", title: "Women in STEM", when: "",
    intro: "Women in science, technology, engineering, math and medicine.",
    match: { all: ["women"], any: ["science", "technology", "engineering", "math", "medicine", "space"] }
  },
  {
    id: "air-and-space", title: "Explorers of Air & Space", when: "",
    intro: "Pilots, astronauts and the scientists who got them there.",
    match: { any: ["space", "aviation"] }
  },
  {
    id: "inventors-engineers", title: "Inventors & Engineers", when: "",
    intro: "People who designed, built and invented the things we use every day.",
    match: { any: ["engineering", "technology"] }
  },
  {
    id: "athletes", title: "Athletes Who Broke Barriers", when: "",
    intro: "Athletes who were the first, the fastest or the bravest, on and off the field.",
    match: { any: ["sports"] }
  },
  {
    id: "artists-performers", title: "Artists & Performers", when: "",
    intro: "Painters, musicians, dancers, actors and filmmakers.",
    match: { any: ["arts", "music", "dance", "film"] }
  },
  {
    id: "young-changemakers", title: "Young Changemakers", when: "",
    intro: "Leaders born in 1990 or later, some of them close to students' own age.",
    match: { bornFrom: 1990 }
  },
  {
    id: "late-bloomers", title: "Late Bloomers", when: "",
    intro: "People who found their calling later in life, proof it's never too late.",
    match: { any: ["age-inclusive"] }
  }
];
