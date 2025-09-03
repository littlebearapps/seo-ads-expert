# API Documentation
## Overview
The Keyword Research API provides tools for discovering keyword suggestions and analyzing keyword data based on specified parameters. The API includes endpoints for keyword and URL-based suggestions, both on a local and global scale.

## Base URL
https://google-keyword-insight1.p.rapidapi.com

## Authentication
This API utilizes RapidAPI for authentication. To access the API, you need to include your RapidAPI key in the request headers.

## Endpoints

1. keysuggest
Retrieves keyword suggestions based on a provided keyword, specific to a location and language.

GET /keysuggest

Parameters
keyword (string): The keyword for which suggestions are required.

location (string): The geographical location for keyword suggestions (e.g., "US", "UK").

lang (string): The language code for the suggestions (e.g., "en", "es").

mode (string, optional): Specifies the filtering criteria for keyword suggestions. It can be either 'exact' or 'all'

min_search_vol (int, optional): Sets a minimum search volume threshold.

intent (string, optional): Filter keywords by search intent. If omitted, empty, or invalid, all keywords are returned.

  Accepted values (case-insensitive):
  
  informational → User is looking for knowledge or answers (e.g., “how to brew green tea”).
  
  navigational → User wants to reach a specific brand/site/app (e.g., “youtube login”).
  
  commercial → User is researching products/services with purchase consideration (e.g., “best green tea brands”).
  
  transactional → User is ready to act or buy (e.g., “buy green tea online”).
return_intent (boolean, optional): If true, adds an "intent" field to each keyword in the response. Default is false.

Example Request
curl --request GET \
	--url 'https://google-keyword-insight1.p.rapidapi.com/keysuggest/?keyword=Sustainable%20Living&location=US&lang=en' \
	--header 'x-rapidapi-host: google-keyword-insight1.p.rapidapi.com' \
	--header 'x-rapidapi-key: Your API KEY'

2. urlkeysuggest
Retrieves keyword suggestions based on the content of a provided URL, specific to a location and language

GET /urlkeysuggest

Parameters
url (string): The URL of the webpage from which to derive keyword suggestions.

location (string): The geographical location for keyword suggestions.

lang (string): The language code for the suggestions.

min_search_vol (int, optional): Sets a minimum search volume threshold.

intent (string, optional): Filter keywords by search intent. If omitted, empty, or invalid, all keywords are returned.

  Accepted values (case-insensitive):
  
  informational → User is looking for knowledge or answers (e.g., “how to brew green tea”).
  
  navigational → User wants to reach a specific brand/site/app (e.g., “youtube login”).
  
  commercial → User is researching products/services with purchase consideration (e.g., “best green tea brands”).
  
  transactional → User is ready to act or buy (e.g., “buy green tea online”).
return_intent (boolean, optional): If true, adds an "intent" field to each keyword in the response. Default is false.

Example Request
curl --request GET \
	--url 'https://google-keyword-insight1.p.rapidapi.com/urlkeysuggest/?url=rapidapi.com&location=US&lang=en' \
	--header 'x-rapidapi-host: google-keyword-insight1.p.rapidapi.com' \
	--header 'x-rapidapi-key: Your API KEY'

3. globalkey
Retrieves keyword suggestions on a global scale based on a provided keyword and language.

GET /globalkey


keyword (string): The keyword for which suggestions are required.

lang (string): The language code for the suggestions.

mode (string, optional): Specifies the filtering criteria for keyword suggestions. It can be either 'exact' or 'all'

min_search_vol (int, optional): Sets a minimum search volume threshold.

intent (string, optional): Filter keywords by search intent. If omitted, empty, or invalid, all keywords are returned.

  Accepted values (case-insensitive):
  
  informational → User is looking for knowledge or answers (e.g., “how to brew green tea”).
  
  navigational → User wants to reach a specific brand/site/app (e.g., “youtube login”).
  
  commercial → User is researching products/services with purchase consideration (e.g., “best green tea brands”).
  
  transactional → User is ready to act or buy (e.g., “buy green tea online”).
return_intent (boolean, optional): If true, adds an "intent" field to each keyword in the response. Default is false.

Example Request
curl --request GET \
	--url 'https://google-keyword-insight1.p.rapidapi.com/globalkey/?keyword=Sustainable%20Living&lang=en' \
	--header 'x-rapidapi-host: google-keyword-insight1.p.rapidapi.com' \
	--header 'x-rapidapi-key: Your API KEY'

4. globalurl
Retrieves keyword suggestions on a global scale based on the content of a provided URL and language.

GET /globalurl

Parameters
url (string): The URL of the webpage from which to derive keyword suggestions.

lang (string): The language code for the suggestions.

min_search_vol (int, optional): Sets a minimum search volume threshold.

intent (string, optional): Filter keywords by search intent. If omitted, empty, or invalid, all keywords are returned.

  Accepted values (case-insensitive):
  
  informational → User is looking for knowledge or answers (e.g., “how to brew green tea”).
  
  navigational → User wants to reach a specific brand/site/app (e.g., “youtube login”).
  
  commercial → User is researching products/services with purchase consideration (e.g., “best green tea brands”).
  
  transactional → User is ready to act or buy (e.g., “buy green tea online”).
return_intent (boolean, optional): If true, adds an "intent" field to each keyword in the response. Default is false.

Example Request
curl --request GET \
	--url 'https://google-keyword-insight1.p.rapidapi.com/globalurl/?url=rapidapi.com&lang=en' \
	--header 'x-rapidapi-host: google-keyword-insight1.p.rapidapi.com' \
	--header 'x-rapidapi-key: Your API KEY'

5. topkeys
This endpoint helps identify high-potential keywords (opportunity keywords) for targeted SEO and marketing strategies.

GET /topkeys

Parameters
keyword (string): The keyword for which suggestions are required.

location (string): The geographical location for keyword suggestions (e.g., "US", "UK").

lang (string): The language code for the suggestions (e.g., "en", "es").

num (int, optional): Specify the number of top keywords to retrieve. By default, the endpoint returns the top 10 keywords, but users can adjust this value to fetch a custom number of results based on their needs.

Example Request
curl --request GET 
	--url 'https://google-keyword-insight1.p.rapidapi.com/topkeys/?keyword=Sustainable%20Living&location=US&lang=en&num=20' 
	--header 'x-rapidapi-host: google-keyword-insight1.p.rapidapi.com' 
	--header 'x-rapidapi-key: 74655cfe4bmsh51b3bb33b74c066p1c94b7jsn2ef16e9de7c7'

## Available Country Codes

AF = Afghanistan

AL = Albania

DZ = Algeria

AS = American Samoa

AD = Andorra

AO = Angola

AQ = Antarctica

AG = Antigua and Barbuda

AR = Argentina

AM = Armenia

AU = Australia

AT = Austria

AZ = Azerbaijan

BH = Bahrain

BD = Bangladesh

BB = Barbados

BY = Belarus

BE = Belgium

BZ = Belize

BJ = Benin

BT = Bhutan

BO = Bolivia

BA = Bosnia and Herzegovina

BW = Botswana

BR = Brazil

BN = Brunei

BG = Bulgaria

BF = Burkina Faso

BI = Burundi

KH = Cambodia

CM = Cameroon

CA = Canada

CV = Cape Verde

BQ = Caribbean Netherlands

CF = Central African Republic

TD = Chad

CL = Chile

CN = China

CX = Christmas Island

CC = Cocos (Keeling) Islands

CO = Colombia

KM = Comoros

CK = Cook Islands

CR = Costa Rica

CI = Cote d'Ivoire

HR = Croatia

CW = Curacao

CY = Cyprus

CZ = Czechia

CD = Democratic Republic of the Congo

DK = Denmark

DJ = Djibouti

DM = Dominica

DO = Dominican Republic

EC = Ecuador

EG = Egypt

SV = El Salvador

GQ = Equatorial Guinea

ER = Eritrea

EE = Estonia

SZ = Eswatini

ET = Ethiopia

FM = Federated States of Micronesia

FJ = Fiji

FI = Finland

FR = France

PF = French Polynesia

TF = French Southern and Antarctic Lands

GA = Gabon

GE = Georgia

DE = Germany

GH = Ghana

GR = Greece

GD = Grenada

GU = Guam

GT = Guatemala

GG = Guernsey

GN = Guinea

GW = Guinea-Bissau

GY = Guyana

HT = Haiti

HM = Heard Island and McDonald Islands

HN = Honduras

HU = Hungary

IS = Iceland

IN = India

ID = Indonesia

IQ = Iraq

IE = Ireland

IL = Israel

IT = Italy

JM = Jamaica

JP = Japan

JE = Jersey

JO = Jordan

KZ = Kazakhstan

KE = Kenya

KI = Kiribati

KW = Kuwait

KG = Kyrgyzstan

LA = Laos

LV = Latvia

LB = Lebanon

LS = Lesotho

LR = Liberia

LY = Libya

LI = Liechtenstein

LT = Lithuania

LU = Luxembourg

MG = Madagascar

MW = Malawi

MY = Malaysia

MV = Maldives

ML = Mali

MT = Malta

MH = Marshall Islands

MR = Mauritania

MU = Mauritius

MX = Mexico

MD = Moldova

MC = Monaco

MN = Mongolia

ME = Montenegro

MA = Morocco

MZ = Mozambique

MM = Myanmar (Burma)

NA = Namibia

NR = Nauru

NP = Nepal

NL = Netherlands

NC = New Caledonia

NZ = New Zealand

NI = Nicaragua

NE = Niger

NG = Nigeria

NU = Niue

NF = Norfolk Island

MK = North Macedonia

MP = Northern Mariana Islands

NO = Norway

OM = Oman

PK = Pakistan

PW = Palau

PA = Panama

PG = Papua New Guinea

PY = Paraguay

PE = Peru

PH = Philippines

PN = Pitcairn Islands

PL = Poland

PT = Portugal

QA = Qatar

CG = Republic of the Congo

RO = Romania

RU = Russia

RW = Rwanda

BL = Saint Barthelemy

SH = Saint Helena, Ascension and Tristan da Cunha

KN = Saint Kitts and Nevis

LC = Saint Lucia

MF = Saint Martin

PM = Saint Pierre and Miquelon

VC = Saint Vincent and the Grenadines

WS = Samoa

SM = San Marino

ST = Sao Tome and Principe

SA = Saudi Arabia

SN = Senegal

RS = Serbia

SC = Seychelles

SL = Sierra Leone

SG = Singapore

SX = Sint Maarten

SK = Slovakia

SI = Slovenia

SB = Solomon Islands

SO = Somalia

ZA = South Africa

GS = South Georgia and the South Sandwich Islands

KR = South Korea

SS = South Sudan

ES = Spain

LK = Sri Lanka

SD = Sudan

SR = Suriname

SE = Sweden

CH = Switzerland

TW = Taiwan

TJ = Tajikistan

TZ = Tanzania

TH = Thailand

BS = The Bahamas

GM = The Gambia

TL = Timor-Leste

TG = Togo

TK = Tokelau

TO = Tonga

TT = Trinidad and Tobago

TN = Tunisia

TR = Turkey

TM = Turkmenistan

TV = Tuvalu

UG = Uganda

UA = Ukraine

AE = United Arab Emirates

GB = United Kingdom

US = United States

UM = United States Minor Outlying Islands

UY = Uruguay

UZ = Uzbekistan

VU = Vanuatu

VA = Vatican City

VE = Venezuela

VN = Vietnam

WF = Wallis and Futuna

YE = Yemen

ZM = Zambia

ZW = Zimbabwe

## Language Codes

ar=Arabic

bn=Bengali

bg=Bulgarian

ca=Catalan

zh=Chinese

hr=Croatian

cs=Czech

da=Danish

nl=Dutch

en=English

et=Estonian

tl=Filipino

fi=Finnish

fr=French

de=German

el=Greek

gu=Gujarati

iw=Hebrew

hi=Hindi

hu=Hungarian

is=Icelandic

id=Indonesian

it=Italian

ja=Japanese

kn=Kannada

ko=Korean

lv=Latvian

lt=Lithuanian

ms=Malay

ml=Malayalam

mr=Marathi

no=Norwegian

fa=Persian

pl=Polish

pt=Portuguese

pa=Punjabi

ro=Romanian

ru=Russian

sr=Serbian

sk=Slovak

sl=Slovenian

es=Spanish

sv=Swedish

ta=Tamil

te=Telugu

th=Thai

tr=Turkish

uk=Ukrainian

ur=Urdu

vi=Vietnamese