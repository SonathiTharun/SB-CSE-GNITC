// Global data
let studentsData = [];
let filteredData = [];

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  setupEventListeners();
  setCurrentDate();
});

function loadData() {
  try {
    studentsData = embeddedData.students.filter(s => s.photo && s.photo.trim() !== '');
    filteredData = [...studentsData];
    populateCompanyFilter();
    updateStats();
    renderTable();
  } catch (e) { console.error(e); }
}

function setupEventListeners() {
  document.getElementById("searchInput").addEventListener("input", filterData);
  document.getElementById("companyFilter").addEventListener("change", filterData);
  document.getElementById("sortBy").addEventListener("change", sortData);
}

function setCurrentDate() {
  document.getElementById("currentDate").textContent = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
}

function populateCompanyFilter() {
  const companies = [...new Set(studentsData.map(s => s.company))].filter(c => c).sort();
  const select = document.getElementById("companyFilter");
  companies.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });
}

function updateStats() {
  document.getElementById("totalCount").textContent = studentsData.length;
  document.getElementById("studentsWithPhotos").textContent = studentsData.filter(s => s.photo).length;
  document.getElementById("uniqueCompanies").textContent = new Set(studentsData.map(s => s.company)).size;
  document.getElementById("avgPackage").textContent = (studentsData.reduce((sum, s) => sum + s.salary, 0) / studentsData.length).toFixed(1);
}

function filterData() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const company = document.getElementById("companyFilter").value;
  filteredData = studentsData.filter(s => 
    (s.name.toLowerCase().includes(search) || s.id.toLowerCase().includes(search)) &&
    (!company || s.company === company)
  );
  renderTable();
}

function sortData() {
  const sortBy = document.getElementById("sortBy").value;
  filteredData.sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "salary-high") return b.salary - a.salary;
    if (sortBy === "salary-low") return a.salary - b.salary;
    if (sortBy === "company") return a.company.localeCompare(b.company);
    return a.sno - b.sno;
  });
  renderTable();
}

function getInitials(name) {
  return name.split(" ").filter(w => w).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function getSalaryClass(s) { return s >= 10 ? "salary-high" : s >= 5 ? "salary-medium" : "salary-low"; }

function renderTable() {
  const tbody = document.getElementById("tableBody");
  if (!filteredData.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="no-results"><p>No students found.</p></td></tr>`;
    return;
  }
  tbody.innerHTML = filteredData.map((s, i) => `
    <tr>
      <td class="col-sno">${i + 1}</td>
      <td class="col-photo"><img src="${s.photo}" class="student-photo" onerror="this.outerHTML='<div class=photo-placeholder>${getInitials(s.name)}</div>'"></td>
      <td class="col-id"><span class="student-id">${s.id}</span></td>
      <td class="col-name"><span class="student-name">${s.name}</span></td>
      <td class="col-company"><span class="company-name">${s.company}</span></td>
      <td class="col-logo">${s.logo ? `<img src="logos/${s.logo}" class="company-logo" onerror="this.style.display='none'">` : ''}</td>
      <td class="col-salary"><span class="salary-badge ${getSalaryClass(s.salary)}">${s.salary} LPA</span></td>
    </tr>
  `).join("");
}

// ========== DOWNLOADS - Using Server Endpoints ==========

function exportToPDF() {
  // Open preview page - can print to PDF from there
  window.open('/preview/word', '_blank');
}

function exportToExcel() {
  // Direct download .xlsx file
  window.location.href = '/download/excel';
}

function exportToWord() {
  // Open preview with download option
  window.open('/preview/word', '_blank');
}
