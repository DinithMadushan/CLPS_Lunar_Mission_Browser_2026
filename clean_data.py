import pandas as pd
import numpy as np

# 1. Process Shallow Moonquakes
df_sm = pd.read_csv('nakamura_1979_sm_locations.csv')
# FIX: Safely calculate full date from Year and Julian Day
df_sm['event_timestamp'] = pd.to_datetime(df_sm['Year'], format='%Y') + \
                           pd.to_timedelta(df_sm['Day'] - 1, unit='D') + \
                           pd.to_timedelta(df_sm['H'], unit='h') + \
                           pd.to_timedelta(df_sm['M'], unit='m') + \
                           pd.to_timedelta(df_sm['S'], unit='s')
df_sm = df_sm.rename(columns={'Lat': 'latitude', 'Long': 'longitude', 'Magnitude': 'magnitude'})
df_sm['depth_km'] = np.nan
df_sm['event_type'] = 'shallow'
df_sm = df_sm[['event_timestamp', 'latitude', 'longitude', 'magnitude', 'depth_km', 'event_type']]

# 2. Process Artificial Impacts
df_ai = pd.read_csv('nakamura_1983_ai_locations.csv')
df_ai['Year'] = 1900 + df_ai['Y']  
# FIX: Safely calculate full date from Year and Julian Day
df_ai['event_timestamp'] = pd.to_datetime(df_ai['Year'], format='%Y') + \
                           pd.to_timedelta(df_ai['JD'] - 1, unit='D') + \
                           pd.to_timedelta(df_ai['Hour'], unit='h') + \
                           pd.to_timedelta(df_ai['Min'], unit='m') + \
                           pd.to_timedelta(df_ai['Sec'], unit='s')
df_ai = df_ai.rename(columns={'Lat': 'latitude', 'Long': 'longitude'})
df_ai['magnitude'] = np.nan 
df_ai['depth_km'] = np.nan
df_ai['event_type'] = 'artificial_impact'
df_ai = df_ai[['event_timestamp', 'latitude', 'longitude', 'magnitude', 'depth_km', 'event_type']]

# 3. Process Deep Moonquakes
df_dm = pd.read_csv('nakamura_2005_dm_locations.csv')
df_dm['event_timestamp'] = pd.NaT 
df_dm = df_dm.rename(columns={'Lat': 'latitude', 'Long': 'longitude', 'Depth': 'depth_km'})
df_dm['magnitude'] = np.nan
df_dm['event_type'] = 'deep'
df_dm = df_dm[['event_timestamp', 'latitude', 'longitude', 'magnitude', 'depth_km', 'event_type']]

# 4. Combine and Export
master_df = pd.concat([df_sm, df_ai, df_dm], ignore_index=True)
master_df.to_csv('cleaned_moonquakes_master.csv', index=False)
print("Merge complete! Timestamp fixed.")