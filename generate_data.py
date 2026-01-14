import pandas as pd
import json
import os
import re

# Read Excel
df = pd.read_excel(r'd:\SB photos\New folder\131 CSE-Special batch selected students.xlsx')

# Get list of photo files
photo_dir = r'd:\SB photos\New folder'
photos = [f for f in os.listdir(photo_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]

# Create mapping of ID to photo filename
photo_map = {}
for photo in photos:
    match = re.match(r'([0-9A-Za-z]+)', photo)
    if match:
        photo_map[match.group(1).upper()] = photo

# Get logo files
logo_dir = r'd:\SB photos\New folder\logos'
logos = os.listdir(logo_dir)

# Company to logo mapping (based on actual file names)
company_logo_map = {
    'CDK Global': '',
    'CODTECH IT SOLUTIONS': 'codtech.jfif',
    'Cognizant NPN Salesforce': 'cognizant.jfif',
    'Deloitte': 'deloite.png',
    'Dexterity Edtech Pvt Ltd.': 'dexterity.jfif',
    'ET Creatives': 'et creatives.png',
    'Grad Guru': 'grad guru.png',
    'HCLTech': 'HCL tech.jfif',
    'KeshavSoft': 'Keshav soft.png',
    'LTIMindtree': 'LTI mindtree.png',
    'MSsquare technologies': 'MS square.jfif',
    'Modak Analytics LLP': 'modak analtics.png',
    'Mu Sigma': 'Mu-Sigma.jpg',
    'Nocac Ventures Pvt. Ltd.': 'NOCAC.jfif',
    'Pandora R&D Labs Pvt Ltd.': 'Pandora R&D Labs.jfif',
    'RealPage India Private Limited': 'RealPage India.jpg',
    'SprintM Technologies': 'SprintM Tech.png',
    'TURTIL': 'TURTIL.jfif',
    'The Leading Solutions': 'Leading Solutions.png',
    'Tutorac': 'Tutorac.jfif',
    'Vijay Software Solutions': 'Vijay Software.jpeg'
}

# Build student data
students = []
columns = df.columns.tolist()
print("Columns:", columns)

for idx, row in df.iterrows():
    student_id = str(row['H.T.No.']).strip().upper()
    name = str(row['Name ']).strip() if pd.notna(row['Name ']) else ''
    company = str(row['Company Name']).strip() if pd.notna(row['Company Name']) else ''
    
    # Get salary column (might have newline in name)
    salary_col = [c for c in columns if 'Salary' in c or 'Stipend' in c][0]
    salary = row[salary_col] if pd.notna(row[salary_col]) else 0
    
    # Find photo
    photo = photo_map.get(student_id, '')
    
    # Find logo
    logo = company_logo_map.get(company, '')
    
    students.append({
        'sno': idx + 1,
        'id': student_id,
        'name': name,
        'company': company,
        'salary': float(salary),
        'photo': photo,
        'logo': logo
    })

# Save JSON
with open(r'd:\SB photos\New folder\data.json', 'w', encoding='utf-8') as f:
    json.dump({'students': students, 'total': len(students)}, f, indent=2, ensure_ascii=False)

print(f'Generated data.json with {len(students)} students')
print(f'Students with photos: {sum(1 for s in students if s["photo"])}')
print(f'Companies with logos: {sum(1 for s in students if s["logo"])}')
